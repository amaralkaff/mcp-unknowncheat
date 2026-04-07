import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { load } from "cheerio";
import { navigateWithRetry } from "../browser.js";

const UC_SEARCH = "https://www.unknowncheats.me/forum/search.php?do=process";

function parseThreadList(html: string) {
  const $ = load(html);
  const results: Array<{
    title: string;
    url: string;
    threadId: string;
    author?: string;
    date?: string;
    replies?: number;
    views?: number;
    subforum?: string;
    snippet?: string;
  }> = [];

  // UC uses id="thread_title_NNNNN" for thread title links
  $("a[id^='thread_title_']").each((_, el) => {
    const link = $(el);
    const title = link.text().trim();
    const href = link.attr("href") ?? "";
    const id = (link.attr("id") ?? "").replace("thread_title_", "");
    if (!title || !href) return;

    const url = href.startsWith("http") ? href : `https://www.unknowncheats.me${href.startsWith("/") ? "" : "/"}${href}`;

    const row = link.closest("tr, div[id^='threadbit'], li[id^='thread_']");

    // Author — look for username link or threadstarter info
    const author = row.find(".threadstarterinfo a, a.username, .username").first().text().trim();

    // Date — last post date or thread start date
    const date = row.find(".threadlastpost .date, .time, .date").first().text().trim();

    // Subforum
    const subforum = row.find("a[href*='forumdisplay'], .forumtitle").first().text().trim();

    // Replies and views — find the stats cells
    const cells = row.find("td");
    let replies = 0;
    let views = 0;
    cells.each((_, td) => {
      const text = $(td).text().trim();
      const replyMatch = text.match(/(\d[\d,]*)\s*(?:Repl|repl)/);
      const viewMatch = text.match(/(\d[\d,]*)\s*(?:View|view)/);
      if (replyMatch) replies = parseInt(replyMatch[1].replace(/,/g, ""), 10);
      if (viewMatch) views = parseInt(viewMatch[1].replace(/,/g, ""), 10);
    });
    // Fallback: try to get numbers from the stat columns (vBulletin puts them in separate tds)
    if (replies === 0 && views === 0) {
      const nums: number[] = [];
      cells.each((_, td) => {
        const text = $(td).text().trim().replace(/,/g, "");
        if (/^\d+$/.test(text)) nums.push(parseInt(text, 10));
      });
      if (nums.length >= 2) {
        replies = nums[nums.length - 2];
        views = nums[nums.length - 1];
      }
    }

    // Snippet — search results sometimes have preview text
    const snippet = row.find(".threadpreview, .searchresult_text, .smallfont:not(:has(a))").first().text().trim().slice(0, 200) || undefined;

    results.push({ title, url, threadId: id, author: author || undefined, date: date || undefined, replies, views, subforum: subforum || undefined, snippet });
  });

  return results;
}

export function registerSearchForum(server: McpServer): void {
  server.tool(
    "search_forum",
    "Search the UnknownCheats forum. Uses advanced search for accurate keyword results. Can also browse subforums directly.",
    {
      query: z.string().describe("Search query string"),
      subforum: z.string().optional().describe("Subforum slug to browse directly (e.g. 'apex-legends')"),
      title_only: z.boolean().optional().default(true).describe("Search only in thread titles (default true, more accurate)"),
      sort_by: z.enum(["relevancy", "lastpost", "replycount", "views", "threadstart"]).optional().default("relevancy").describe("Sort results by"),
      search_user: z.string().optional().describe("Filter by thread author username"),
    },
    async ({ query, subforum, title_only, sort_by, search_user }) => {
      try {
        // If subforum provided, browse it directly
        if (subforum) {
          const url = `https://www.unknowncheats.me/forum/${subforum}/`;
          const { html } = await navigateWithRetry(url);
          const results = parseThreadList(html);
          return {
            content: [{ type: "text", text: JSON.stringify({ count: results.length, results }) }],
          };
        }

        // Navigate to advanced search page to get CSRF token
        const { page } = await navigateWithRetry("https://www.unknowncheats.me/forum/search.php");

        // Fill the advanced search form using the main form (not navbar)
        const submitted = await page.evaluate((opts) => {
          // Find the advanced search form (action contains "do=process")
          const forms = Array.from(document.querySelectorAll("form"));
          const searchForm = forms.find(f => f.action.includes("do=process"));
          if (!searchForm) return { ok: false, error: "Advanced search form not found" };

          // Fill query — use the large input (size=35)
          const queryInput = searchForm.querySelector('input[name="query"][size="35"]') as HTMLInputElement
            ?? searchForm.querySelector('input[name="query"]') as HTMLInputElement;
          if (!queryInput) return { ok: false, error: "Query input not found in form" };
          queryInput.value = opts.query;

          // Title only checkbox
          const titleOnlyCheckbox = searchForm.querySelector('input[name="titleonly"]') as HTMLInputElement;
          if (titleOnlyCheckbox) {
            titleOnlyCheckbox.checked = opts.titleOnly;
          }

          // Show threads (not posts) — radio value="0"
          const showThreads = searchForm.querySelector('input[name="showposts"][value="0"]') as HTMLInputElement;
          if (showThreads) showThreads.checked = true;

          // Sort by
          const sortSelect = searchForm.querySelector('select[name="sortby"]') as HTMLSelectElement;
          if (sortSelect) sortSelect.value = opts.sortBy;

          // Search user
          if (opts.searchUser) {
            const userInput = searchForm.querySelector('input[name="searchuser"]') as HTMLInputElement;
            if (userInput) userInput.value = opts.searchUser;
          }

          // Submit
          searchForm.submit();
          return { ok: true };
        }, { query, titleOnly: title_only, sortBy: sort_by, searchUser: search_user ?? "" });

        if (!submitted.ok) {
          return {
            content: [{ type: "text", text: `Error: ${(submitted as { error: string }).error}` }],
            isError: true,
          };
        }

        // Wait for navigation after form submit
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2_000));

        const html = await page.content();
        const results = parseThreadList(html);
        const $ = load(html);
        const pageTitle = $("title").text().trim();

        // Check for search errors (UC shows errors like "too many searches" or "no results")
        const errorText = $(".standard_error, .errorwrap, .blockbody .error").first().text().trim();
        if (errorText) {
          return {
            content: [{ type: "text", text: JSON.stringify({ count: 0, error: errorText, pageTitle }) }],
          };
        }

        // Pagination info
        const pageNav = $(".pagenav td.vbmenu_control").first().text().trim();
        const pageMatch = pageNav.match(/Page (\d+) of (\d+)/);
        const pagination = pageMatch ? { currentPage: parseInt(pageMatch[1]), totalPages: parseInt(pageMatch[2]) } : undefined;

        console.error(`[search] "${query}" → ${results.length} results, page: ${pageTitle}`);

        return {
          content: [{ type: "text", text: JSON.stringify({ count: results.length, pageTitle, pagination, results }) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
