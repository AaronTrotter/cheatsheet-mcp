# cheatsheet-mcp

Client-side MCP tooling for [cheatsheet](https://cheats.aarontrotter.com), a personal cheat-sheet
web app. Lets an MCP client (Claude Code, Claude Desktop, or any other MCP-compatible agent)
search, read, and manage your cheats, without an API key ever being typed into chat.

The hosted server itself (`POST /mcp`) lives in the app's own repo, at
[`functions/routes/db/mcpConnector.js`](https://github.com/AaronTrotter/cheatsheet). Everything in
*this* repo is client-side: ways to reach that server, plus a standalone reference implementation.

## What's here

Two ways the API key gets supplied, across four setups:

- **File-based, from a gitignored `.env.local`** — the key never leaves your disk as a shell var
  or gets typed into any settings UI. Recommended default. Works for:
  - **[`claude-plugin/`](claude-plugin)** — the hosted connector packaged as an installable Claude
    Code plugin: `/plugin marketplace add AaronTrotter/cheatsheet-mcp`. Bundles its own copy of
    `live-proxy.js` below. PC/Claude Code only.
  - **[`live-proxy.js`](live-proxy.js)** — the same proxy, wired up by hand instead of through the
    plugin.
  - **[`local-mcp-server/`](local-mcp-server)** — a standalone stdio server that wraps the
    cheatsheet's REST API directly, kept as a customizable reference for a project that wants to
    modify the tool set or run its own variant.
- **Bearer, from a real environment variable** — no local process, just
  `Authorization: Bearer ${CHEATSHEET_API_KEY}` in the client's own config. A persistent
  environment variable is readable by every process running under your OS user account, so treat
  this as the fallback for setups the file-based option can't reach, not the default. Needed for:
  - **Mobile / claude.ai** — add `https://cheats.aarontrotter.com/mcp` as a custom connector in
    claude.ai's web settings (Settings → Connectors → Add custom connector), with the same
    `Authorization: Bearer <key>` header. This is the only option that works from the Claude
    mobile app, since claude.ai brokers connectors through your account rather than a local
    process. See [`local-mcp-server/README.md`](local-mcp-server/README.md#mobile--claudeai) for
    the key-scoping recommendation before you paste a key into that field.

See [`local-mcp-server/README.md`](local-mcp-server/README.md) for the full comparison.

## Setup

1. Create an API key: sign in at the cheatsheet, go to `/user` → API Access, and create one
   (read-only or read + write, depending on what you want a client to be able to do). Create a
   separate key per method above if you want to be able to revoke one without affecting the
   others — see the mobile section linked above for why that matters most for the bearer method.
2. Pick one of the options above and follow its own README.
