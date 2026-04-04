import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { navigateWithRetry } from "../browser.js";
import { parseCodeBlocks } from "../parsers/code-blocks.js";

export function registerExtractCode(server: McpServer): void {
  server.tool(
    "extract_code",
    "Extract and identify code blocks from a thread. Detects C++, C#, Python, and Lua.",
    {
      url: z.string().url().describe("Thread URL to extract code from"),
    },
    async ({ url }) => {
      try {
        const { html } = await navigateWithRetry(url);
        const blocks = parseCodeBlocks(html);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count: blocks.length, blocks }),
            },
          ],
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
