# cheatsheet-mcp

Client-side MCP tooling for [cheatsheet](https://cheats.aarontrotter.com), a personal cheat-sheet
web app. Lets an MCP client (Claude Code, Claude Desktop, or any other MCP-compatible agent)
search, read, and manage your cheats, without an API key ever being typed into chat.

The hosted server itself (`POST /mcp`) lives in the app's own repo, at
[`functions/routes/db/mcpConnector.js`](https://github.com/AaronTrotter/cheatsheet). Everything in
*this* repo is client-side: ways to reach that server, plus a standalone reference implementation.

## What's here

Three ways to authenticate an MCP client against the hosted connector, split by how the
credential gets supplied:

- **File-based, from a gitignored `.env.local`** — the key never leaves your disk as a shell var
  or gets typed into any settings UI. Recommended default when it's an option. Works for:
  - **[`claude-plugin/`](claude-plugin/README.md)** — the hosted connector packaged as an
    installable Claude Code plugin: `/plugin marketplace add AaronTrotter/cheatsheet-mcp`. Bundles
    its own copy of `live-proxy.js` below. PC/Claude Code only.
  - **[`live-proxy.js`](live-proxy.js)** — the same proxy, wired up by hand instead of through the
    plugin. Documented alongside the option below in
    [`local-mcp-server/README.md`](local-mcp-server/README.md).
  - **[`local-mcp-server/`](local-mcp-server/README.md)** — a standalone stdio server that wraps
    the cheatsheet's REST API directly, kept as a customizable reference for a project that wants
    to modify the tool set or run its own variant.
- **Bearer, from a real environment variable or a custom connector field** — no local process,
  just `Authorization: Bearer <key>` in the client's own config. Needed for:
  - **Mobile / claude.ai / Desktop connectors** — add `https://cheats.aarontrotter.com/mcp` as a
    custom connector (Settings → Connectors → Add custom connector), with an
    `Authorization: Bearer <key>` header. Account-wide: set it up once and it's available
    everywhere you're signed in, including the mobile app, since claude.ai brokers connectors
    through your account rather than a local process. See
    [`local-mcp-server/README.md`](local-mcp-server/README.md#mobile--claudeai) for the
    key-scoping recommendation before you paste a key into that field.
- **OAuth — no key to paste at all.** Add the exact same custom connector as above, but leave the
  header blank. The hosted connector publishes standard OAuth discovery metadata
  (`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`) and a
  `WWW-Authenticate` challenge on `/mcp`'s `401`, so an OAuth-aware client (claude.ai included)
  detects the flow automatically and shows a normal cheatsheet sign-in and consent screen instead
  — a scoped key is minted and handed over behind the scenes, never visible to you or typed
  anywhere. Works anywhere the bearer method above does (Desktop, mobile, claude.ai web); a client
  that doesn't support OAuth discovery just falls back to the bearer method. This is server-side
  behavior (`functions/routes/db/oauth.js` in the
  [cheatsheet](https://github.com/AaronTrotter/cheatsheet) repo) — nothing to install here.

See [`local-mcp-server/README.md`](local-mcp-server/README.md) for the full comparison of the
file-based options.

## Setup

1. **File-based or bearer:** create an API key first — sign in at the cheatsheet, go to `/user` →
   API Access, and create one (read-only or read + write, depending on what you want a client to
   be able to do). Create a separate key per method above if you want to be able to revoke one
   without affecting the others — see the mobile section linked above for why that matters most
   for the bearer method. Then pick one of the two options above and follow its own README.
2. **OAuth:** no key to create beforehand — add the custom connector with no header, and approve
   the sign-in/consent screen the client shows you when it first connects. A scoped key is minted
   for you at that point and shows up on `/user` afterward, revocable the same way as any other.
