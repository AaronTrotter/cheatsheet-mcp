# cheatsheet-mcp

Client-side MCP tooling for [cheatsheet](https://cheats.aarontrotter.com), a personal cheat-sheet
web app. Lets an MCP client (Claude Code, Claude Desktop, the Claude mobile app, or any other
MCP-compatible agent) search, read, and manage your cheats and Tasks, without an API key ever
being typed into chat.

The hosted server itself (`POST /mcp`) lives in the app's own repo, at
[`functions/routes/db/mcpConnector.js`](https://github.com/AaronTrotter/cheatsheet). Everything in
*this* repo is client-side: ways to reach that server, plus a standalone reference implementation.
See the app's own [Connect an MCP Client](https://cheats.aarontrotter.com/api-docs/connect-mcp)
page for the same walkthrough from the web app's side.

## Choose how to connect

There are two ways to connect an MCP client to Cheatsheet:

- **Option A — Connect through Claude.** Add Cheatsheet as a connector inside claude.ai, Claude
  Desktop, or the Claude mobile app. No local setup, works everywhere you're signed in, including
  mobile. Nothing in this repo to install — see [below](#option-a-connect-through-claude).
- **Option B — Run a local MCP server.** A small process on your own machine handles the
  connection, wired up through a config file like Claude Code's `.mcp.json`. Needs a one-time
  local setup and doesn't reach the mobile app, but keeps your key on your own disk instead of in
  another company's settings UI. This is what most of this repo is for — see
  [below](#option-b-run-a-local-mcp-server).

Not sure which one? Start with Option A, it's the fastest to set up and needs no local files.

## Option A: Connect through Claude

In claude.ai, Claude Desktop, or the Claude mobile app, go to
**Settings → Connectors → Add custom connector** and enter:

- URL: `https://cheats.aarontrotter.com/mcp`
- Header (optional — see below): `Authorization: Bearer <your key>`

Once added, claude.ai brokers it through your account, so it works from the mobile apps too, not
just the browser (or Desktop app) it was configured in. Two ways to authenticate:

- **Sign in with Cheatsheet (recommended).** Leave the header blank. The hosted connector
  publishes standard OAuth discovery metadata (`/.well-known/oauth-authorization-server`,
  `/.well-known/oauth-protected-resource`) and a `WWW-Authenticate` challenge on `/mcp`'s `401`, so
  an OAuth-aware client detects the flow automatically and shows a normal Cheatsheet sign-in and
  consent screen instead of asking for a key — a scoped key is minted and handed over behind the
  scenes, never visible to you or typed anywhere. This is server-side behavior
  (`functions/routes/db/oauth.js` in the [cheatsheet](https://github.com/AaronTrotter/cheatsheet)
  repo) — nothing to install here.
- **Paste an API key.** If your client doesn't support the sign-in flow, create a key at
  `/user` → API Access and paste it into the header field above. Since this means the key lives in
  a field in claude.ai's own settings rather than a local file or shell variable, create a
  **separate, narrowly-scoped key** just for this connector (read-only, if you don't need write
  access) so it can be revoked on its own without touching any other integration.

## Option B: Run a local MCP server

For Claude Code, or any other client that reads a `.mcp.json`-style config, a small local process
handles the connection so your API key stays in a file on your own disk instead of a client config
or shell environment variable. Pick one:

- **[`claude-plugin/`](claude-plugin/README.md)** (easiest) — the hosted connector packaged as an
  installable Claude Code plugin: `/plugin marketplace add AaronTrotter/cheatsheet-mcp`. Bundles
  its own copy of `live-proxy.js` below, reading the key from a file in Claude Code's persistent
  plugin data directory. PC/Claude Code only.
- **[`live-proxy.js`](live-proxy.js)** — the same proxy, for wiring up `.mcp.json` by hand instead
  of through the plugin (e.g. for a client other than Claude Code). Setup steps are on the app's
  own [Setting up the MCP proxy](https://cheats.aarontrotter.com/api-docs/mcp-proxy-setup) page.
- **[`local-mcp-server/`](local-mcp-server/README.md)** — a standalone stdio server that wraps the
  cheatsheet's REST API directly instead of forwarding to the hosted connector, kept as a
  customizable reference for a project that wants to modify the tool set or run its own variant.
  Currently covers cheats only, not Tasks — see its own README.

All three keep the key on your own machine and don't reach the mobile app, which has no local
process to run one in.

## Setup

1. **Create an API key first**, whichever option you're using — sign in at the cheatsheet, go to
   `/user` → API Access, and create one (read-only or read + write, depending on what you want a
   client to be able to do). Create a separate key per method if you want to be able to revoke one
   without affecting the others — see the key-scoping note under Option A for why that matters most
   there.
2. Then follow the specific option's own steps above (or its linked README).

Skip this step entirely if you're using Option A's sign-in flow — no key to create beforehand, a
scoped one is minted for you automatically and shows up on `/user` afterward, revocable the same
way as any other.
