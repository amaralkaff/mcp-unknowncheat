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

        // --- Keyword search via Puppeteer form submission ---
        const { page } = await navigateWithRetry(UC_SEARCH);

        // Dump all input names on the page for diagnostics
        const formInfo = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll("input, textarea")).map((el) => ({
            tag: el.tagName.toLowerCase(),
            name: (el as HTMLInputElement).name,
            type: (el as HTMLInputElement).type,
            id: el.id,
            size: (el as HTMLInputElement).size,
          }));
          const forms = Array.from(document.querySelectorAll("form")).map((f) => ({
            action: f.action,
            method: f.method,
          }));
          return { inputs, forms };
        });

        console.error("[search] Form info:", JSON.stringify(formInfo));

        // Try selectors in priority order
        const SELECTORS = [
          'input[name="query"][size="35"]',
          'input[name="query"]',
          'textarea[name="query"]',
          '#navbar_search_field',
          'input[type="text"][name*="search"]',
          'input[type="text"]:not([name="searchuser"])',
        ];

        let filled = false;
        for (const sel of SELECTORS) {
          try {
            const el = await page.$(sel);
            if (el) {
              await page.click(sel, { clickCount: 3 });
              await page.type(sel, query, { delay: 40 });
              console.error(`[search] Filled input with selector: ${sel}`);
              filled = true;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!filled) {
          return {
            content: [{ type: "text", text: `Error: Could not find search input. Form info: ${JSON.stringify(formInfo)}` }],
            isError: true,
          };
        }

        // Submit — press Enter (most reliable for vBulletin search)
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => {}),
          page.keyboard.press("Enter"),
        ]);

        await new Promise((r) => setTimeout(r, 1_500));

        const html = await page.content();
        const results = parseThreadList(html);
        const $ = load(html);
        const pageTitle = $("title").text().trim();

        console.error(`[search] "${query}" → ${results.length} results, page: ${pageTitle}`);

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
