# cheatsheet-mcp

Client-side MCP tooling for [cheatsheet](https://cheats.aarontrotter.com), a personal cheat-sheet
web app. Lets an MCP client (Claude Code, Claude Desktop, or any other MCP-compatible agent)
search, read, and manage your cheats, without an API key ever being typed into chat.

The hosted server itself (`POST /mcp`) lives in the app's own repo, at
[`functions/routes/db/mcpConnector.js`](https://github.com/AaronTrotter/cheatsheet). Everything in
*this* repo is client-side: ways to reach that server, plus a standalone reference implementation.

## What's here

- **[`claude-plugin/`](claude-plugin)** — the hosted connector packaged as an installable Claude
  Code plugin. Easiest option if you're on Claude Code: `/plugin marketplace add
  AaronTrotter/cheatsheet-mcp`.
- **[`live-proxy.js`](live-proxy.js)** — a local stdio proxy in front of the hosted connector that
  reads your API key from a gitignored `.env.local` file instead of a shell environment variable.
- **[`local-mcp-server/`](local-mcp-server)** — a standalone stdio server that wraps the
  cheatsheet's REST API directly, kept as a customizable reference for a project that wants to
  modify the tool set or run its own variant. See its
  [README](local-mcp-server/README.md) for a full comparison of all the options, including adding
  the hosted connector directly with no local process at all.

## Setup

1. Create an API key: sign in at the cheatsheet, go to `/user` → API Access, and create one
   (read-only or read + write, depending on what you want a client to be able to do).
2. Pick one of the options above and follow its own README.
