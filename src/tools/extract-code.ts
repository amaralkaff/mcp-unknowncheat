import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { navigateWithRetry } from "../browser.js";
import { parseCodeBlocks } from "../parsers/code-blocks.js";

const MAX_CODE_LENGTH = 3_000;

export function registerExtractCode(server: McpServer): void {
  server.tool(
    "extract_code",
    "Extract and identify code blocks from a thread. Detects C++, C#, Python, and Lua.",
    {
      url: z.string().url().describe("Thread URL to extract code from"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Max number of code blocks to return (default 5, max 20)"),
    },
    async ({ url, limit }) => {
      try {
        const { html } = await navigateWithRetry(url);
        const all = parseCodeBlocks(html);

        const blocks = all.slice(0, limit).map((b) => ({
          ...b,
          code:
            b.code.length > MAX_CODE_LENGTH
              ? b.code.slice(0, MAX_CODE_LENGTH) + `\n... [truncated, ${b.code.length} chars total]`
              : b.code,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ total: all.length, returned: blocks.length, blocks }),
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
