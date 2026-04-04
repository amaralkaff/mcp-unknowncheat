import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { navigateWithRetry } from "../browser.js";
import { parseThread } from "../parsers/thread.js";
import type { ThreadPost } from "../types.js";

const MAX_PAGES = 50;

function buildPageUrl(baseUrl: string, page: number): string {
  // vBulletin supports both ?page=N and /pageN suffixes
  // Prefer query string if already present, otherwise append
  const url = new URL(baseUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

export function registerGetThread(server: McpServer): void {
  server.tool(
    "get_thread",
    "Get thread content from UnknownCheats. Set fetch_all_pages to true to retrieve all pages.",
    {
      url: z.string().url().describe("Thread URL"),
      fetch_all_pages: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, fetches all pages of the thread (max 50 pages)"),
    },
    async ({ url, fetch_all_pages }) => {
      try {
        // Fetch first page
        const { html: firstHtml } = await navigateWithRetry(url);
        const firstPage = parseThread(firstHtml, url, 1);

        if (!fetch_all_pages || firstPage.totalPages <= 1) {
          return {
            content: [{ type: "text", text: JSON.stringify(firstPage) }],
          };
        }

        // Accumulate all pages
        const allPosts: ThreadPost[] = [...firstPage.posts];
        const pagesToFetch = Math.min(firstPage.totalPages, MAX_PAGES);

        for (let pageNum = 2; pageNum <= pagesToFetch; pageNum++) {
          await new Promise((r) => setTimeout(r, 1_200)); // polite delay

          const pageUrl = buildPageUrl(url, pageNum);
          const { html } = await navigateWithRetry(pageUrl);
          const parsed = parseThread(html, pageUrl, pageNum);
          allPosts.push(...parsed.posts);

          console.error(`[get-thread] Fetched page ${pageNum}/${pagesToFetch}`);
        }

        const result = {
          ...firstPage,
          posts: allPosts,
          currentPage: pagesToFetch,
          totalPages: firstPage.totalPages,
          note:
            firstPage.totalPages > MAX_PAGES
              ? `Capped at ${MAX_PAGES} pages (thread has ${firstPage.totalPages} total)`
              : undefined,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
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
