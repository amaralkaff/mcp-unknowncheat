# uc-mcp-server

An MCP (Model Context Protocol) server for programmatically interacting with the [UnknownCheats](https://www.unknowncheats.me) forum. Bypasses Cloudflare protection using a real Chrome instance and provides structured data extraction via Cheerio.

[![npm version](https://img.shields.io/npm/v/uc-mcp-server)](https://www.npmjs.com/package/uc-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/uc-mcp-server)](https://www.npmjs.com/package/uc-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/amaralkaff/mcp-unknowncheat/blob/master/LICENSE)

## Features

- **Cloudflare bypass** — Uses `puppeteer-real-browser` with a headed Chrome instance to solve Turnstile challenges automatically
- **Cookie persistence** — Session cookies saved to `cookies.json` and reused across restarts
- **Auto-recovery** — Detects detached frame / browser crash errors and relaunches automatically
- **5 MCP tools** — Login, search, thread reading, pagination, and code extraction

## Tools

| Tool | Description | Parameters |
|---|---|---|
| `check_login` | Check if the browser session is logged in | — |
| `login` | Auto-fill credentials and log in | `username`, `password` |
| `search_forum` | Search UC or browse a subforum | `query`, `subforum?` |
| `get_thread` | Fetch thread posts with pagination | `url`, `fetch_all_pages?` |
| `extract_code` | Extract C++/C#/Python/Lua code blocks | `url` |

## Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript (ESM)
- **Protocol**: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **Browser**: [puppeteer-real-browser](https://github.com/zfcsoftware/puppeteer-real-browser)
- **Parsing**: [cheerio](https://cheerio.js.org)

## Requirements

- [Bun](https://bun.sh) v1.0+
- Google Chrome installed (required by puppeteer-real-browser)

## Installation

```bash
# via npm
npx uc-mcp-server

# or clone
git clone https://github.com/amaralkaff/mcp-unknowncheat.git
cd mcp-unknowncheat
bun install
```

## Setup with Claude Code

```bash
claude mcp add uc-mcp bun -- run "/path/to/mcp-unknowncheat/src/index.ts"
```

Or with npx:

```bash
claude mcp add uc-mcp npx -- uc-mcp-server
```

## Setup with Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "uc-mcp": {
      "command": "npx",
      "args": ["uc-mcp-server"]
    }
  }
}
```

## Usage

On first run, Chrome opens in headed mode. Log in manually or use the `login` tool:

```
login({ username: "your_username", password: "your_password" })
```

Cookies are saved automatically. Subsequent runs reuse the session.

### Examples

```
# Check login status
check_login()

# Browse the Apex Legends subforum
search_forum({ subforum: "apex-legends" })

# Search across all forums
search_forum({ query: "pubg offsets" })

# Get a thread (single page)
get_thread({ url: "https://www.unknowncheats.me/forum/..." })

# Get all pages of a thread
get_thread({ url: "https://www.unknowncheats.me/forum/...", fetch_all_pages: true })

# Extract code blocks with language detection
extract_code({ url: "https://www.unknowncheats.me/forum/..." })
```

## Project Structure

```
src/
├── index.ts          # MCP server entry + tool registration
├── browser.ts        # Chrome lifecycle, Cloudflare bypass, cookie persistence
├── types.ts          # Shared TypeScript interfaces
├── tools/
│   ├── check-login.ts
│   ├── login.ts
│   ├── search-forum.ts
│   ├── get-thread.ts
│   ├── extract-code.ts
│   └── debug-page.ts
└── parsers/
    ├── thread.ts         # Post extraction, pagination
    ├── search-results.ts # Search result parsing
    ├── code-blocks.ts    # Code extraction + language detection
    └── tags.ts           # Thread tag detection ([Source], [Release], etc.)
```

## Notes

- All logging uses `console.error()` — `console.log()` is reserved for the MCP stdio transport
- Thread pagination capped at 50 pages by default for `fetch_all_pages`
- Language detection supports: C++, C#, Python, Lua

## Issues

Found a bug or want to request a feature? Open an issue at:

https://github.com/amaralkaff/mcp-unknowncheat/issues
