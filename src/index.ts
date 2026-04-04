import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeBrowser } from "./browser.js";
import { registerCheckLogin } from "./tools/check-login.js";
import { registerLogin } from "./tools/login.js";
import { registerSearchForum } from "./tools/search-forum.js";
import { registerGetThread } from "./tools/get-thread.js";
import { registerExtractCode } from "./tools/extract-code.js";
import { registerDebugPage } from "./tools/debug-page.js";

const server = new McpServer({
  name: "unknowncheats",
  version: "1.0.0",
});

// Register all tools
registerCheckLogin(server);
registerLogin(server);
registerSearchForum(server);
registerGetThread(server);
registerExtractCode(server);
registerDebugPage(server);

// Graceful shutdown
async function shutdown() {
  console.error("[server] Shutting down...");
  await closeBrowser();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => closeBrowser());

// Connect stdio transport (IMPORTANT: never write to stdout except via MCP)
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("[server] MCP UnknownCheats server started (uc-mcp-server)");
