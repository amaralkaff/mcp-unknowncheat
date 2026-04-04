import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { load } from "cheerio";
import { navigateWithRetry } from "../browser.js";

const UC_SEARCH = "https://www.unknowncheats.me/forum/search.php";

function parseThreadList(html: string) {
  const $ = load(html);
  const results: Array<{
    title: string;
    url: string;
    threadId: string;
    replies?: number;
    views?: number;
  }> = [];

  // UC uses id="thread_title_NNNNN" for thread title links in both search and subforum listings
  $("a[id^='thread_title_']").each((_, el) => {
    const link = $(el);
    const title = link.text().trim();
    const href = link.attr("href") ?? "";
    const id = (link.attr("id") ?? "").replace("thread_title_", "");
    if (!title || !href) return;

    const url = href.startsWith("http") ? href : `https://www.unknowncheats.me${href}`;

    // Get reply/view counts from the same row
    const row = link.closest("tr, div[id^='threadbit']");
    const cells = row.find("td").map((_, td) => $(td).text().trim()).get();
    const nums = cells.join(" ").match(/\d+/g) ?? [];

    results.push({
      title,
      url,
      threadId: id,
      replies: parseInt(nums[0] ?? "0", 10),
      views: parseInt(nums[1] ?? "0", 10),
    });
  });

  return results;
}

export function registerSearchForum(server: McpServer): void {
  server.tool(
    "search_forum",
    "Search the UnknownCheats forum",
    {
      query: z.string().describe("Search query string"),
      subforum: z.string().optional().describe("Subforum slug to browse directly (e.g. 'apex-legends')"),
    },
    async ({ query, subforum }) => {
      try {
        // If subforum provided, browse it directly — more reliable than search
        if (subforum) {
          const url = `https://www.unknowncheats.me/forum/${subforum}/`;
          const { html } = await navigateWithRetry(url);
          const results = parseThreadList(html);
          return {
            content: [{ type: "text", text: JSON.stringify({ count: results.length, results }) }],
          };
        }

        // Navigate to search page and submit the form
        const { page } = await navigateWithRetry(UC_SEARCH);

        // Use the advanced search input (size=35)
        const inputSelector = 'input[name="query"][size="35"]';
        await page.waitForSelector(inputSelector, { timeout: 10_000 });
        await page.click(inputSelector, { clickCount: 3 });
        await page.type(inputSelector, query, { delay: 40 });

        // Submit the form
        await page.evaluate((sel: string) => {
          const input = document.querySelector<HTMLInputElement>(sel);
          const form = input?.closest("form");
          const btn = form?.querySelector<HTMLElement>('input[type="submit"], button[type="submit"]');
          if (btn) btn.click();
          else form?.submit();
        }, inputSelector);

        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 });

        // Wait a bit for any JS rendering
        await new Promise((r) => setTimeout(r, 1_500));

        const html = await page.content();
        const results = parseThreadList(html);
        const $ = load(html);
        const pageTitle = $("title").text().trim();

        console.error(`[search] "${query}" → ${results.length} results on: ${pageTitle}`);

        return {
          content: [{ type: "text", text: JSON.stringify({ count: results.length, pageTitle, results }) }],
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
