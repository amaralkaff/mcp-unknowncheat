# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run src/index.ts       # run the MCP server
bun --watch src/index.ts   # dev mode with hot reload
bun install                # install dependencies
```

There are no tests. No build step — Bun executes TypeScript directly.

## Architecture

**Runtime:** Bun + TypeScript ESM (`"type": "module"`, NodeNext resolution). No compilation output.

**MCP transport:** `StdioServerTransport` — all tool responses go through stdout. **Never use `console.log()`** anywhere in the codebase; use `console.error()` for all debug/logging so it doesn't corrupt the stdio stream.

**Entry point:** `src/index.ts` — creates `McpServer`, registers all tools, connects transport.

### Browser singleton (`src/browser.ts`)

Single Chrome instance shared across all tool calls via `puppeteer-real-browser` (bypasses Cloudflare Turnstile). Key exports:

- `navigateWithRetry(url)` — navigate with Cloudflare detection + auto-relaunch on detached frame errors. Returns `{ page, html }`.
- `ensureFreshBrowser()` — force-kills and relaunches Chrome.
- `getPage()` — returns existing page or launches new browser.

Cookies are persisted to `cookies.json` next to `src/` on every navigation. Session survives server restarts.

### Tools (`src/tools/`)

Each tool is a `registerXxx(server)` function. Tools:

| Tool | What it does |
|---|---|
| `check-login` | Checks `div.usercptools` presence to verify login |
| `login` | Puppeteer form fill on UC login page |
| `search-forum` | Subforum browse OR keyword search via Puppeteer form submission |
| `get-thread` | Parses thread posts with pagination; supports `include_images` (fetches images as base64 MCP content blocks) and `fetch_all_pages` (cap 50 pages) |
| `extract-code` | Extracts code blocks with language detection; supports `export_to_file` (writes all blocks to `./exports/`) and `limit` (default 10, max 50) |
| `download-file` | Downloads UC attachments, extracts archives (zip/rar/7z), analyzes file contents |
| `debug-page` | Returns raw selector diagnostics for reverse-engineering page structure |

### Parsers (`src/parsers/`)

- `thread.ts` — vBulletin post extraction. Posts are `table[id^='post']` where id matches `/^post\d+$/`. Content is `div[id='post_message_NNNNN']`. Pagination from `.pagenav` "Page X of Y" text.
- `code-blocks.ts` — extracts `.highlight, pre, code` elements; detects C++/C#/Python/Lua by pattern matching; attaches `postId` from nearest `table[id^='post']` ancestor.
- `search-results.ts` — parses `a[id^='thread_title_']` links (used by both search results and subforum listings).

### Types (`src/types.ts`)

Shared interfaces: `ThreadPost` (includes `links[]` and `images[]`), `ThreadData`, `CodeBlock` (includes `postId`), `SearchResult`, `PostLink`.

## CI/CD

`.github/workflows/publish.yml` — triggers on push to `master` (ignoring `**.md` changes):
1. `npm version patch --no-git-tag-version`
2. Commits as `chore: release vX.X.X [skip ci]`
3. Tags + pushes
4. `npm publish` (uses `NPM_TOKEN` secret — must be Classic Automation type)
5. Creates GitHub release with auto-generated notes

The `[skip ci]` in the bump commit prevents infinite loops.

## Key constraints

- `cookies.json`, `exports/`, and `downloads/` are gitignored and npmignored — never commit them.
- UC's search requires a POST with CSRF token — keyword search goes through Puppeteer form fill, not a direct HTTP request.
- Images in UC posts use `wol_error.gif` / `statusicon` as placeholders — these are filtered out in the thread parser.
- `include_images: true` fetches up to 10 images per call and returns them as MCP `image` content blocks so the AI can visually read them.
