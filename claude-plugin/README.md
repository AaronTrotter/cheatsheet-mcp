# cheatsheet Claude Code plugin

Packages the hosted `https://cheats.aarontrotter.com/mcp` connector (see
`functions/routes/db/mcpConnector.js` in the [cheatsheet](https://github.com/AaronTrotter/cheatsheet)
repo) as an installable Claude Code plugin — this is Option B's easiest path, see the
[root README](../README.md#option-b-run-a-local-mcp-server) for the full menu of ways to connect,
including Option A for claude.ai, Desktop, and mobile. Bundles its own copy of the `live-proxy.js`
stdio proxy (as `server.js`) so your API key lives in a file, never in a shell environment variable
or typed into any settings UI.

PC/Claude Code only — Claude Code plugins don't run on the Claude mobile app. For phone access, use
Option A in the [root README](../README.md#option-a-connect-through-claude) instead — that's the
one setup that needs no local install at all, since claude.ai brokers the connection through your
account rather than a local process.

## Install

1. In any project, run:
   ```
   /plugin marketplace add AaronTrotter/cheatsheet-mcp
   /plugin install cheatsheet@cheatsheet-mcp
   ```
   Claude Code installs this plugin's own `@modelcontextprotocol/sdk` dependency automatically from
   its committed lockfile.
2. Start Claude Code once and try using the `cheatsheet` server — it won't have a key yet, so it'll
   fail, but the error tells you the exact file to create, something like:
   ```
   CHEATSHEET_API_KEY is not set — create ~/.claude/plugins/data/cheatsheet-cheatsheet-mcp/.env.local
   with a line like CHEATSHEET_API_KEY=csk_live_... (get a key from
   https://cheats.aarontrotter.com/user, API Access section), then restart Claude Code.
   ```
3. Create that file with a key from the [User](https://cheats.aarontrotter.com/user) page's API
   Access section (read-only or read + write, depending on what you want Claude to be able to do),
   restart Claude Code, and approve the `cheatsheet` server when prompted.

That file lives outside the plugin's own cache directory, in Claude Code's
[persistent plugin data directory](https://code.claude.com/docs/en/plugins-reference#persistent-data-directory),
so it survives plugin updates rather than getting wiped on the next `/plugin update`.

## Why a file, not a shell environment variable

A persistent environment variable is readable by every process running under your OS user account,
not just Claude Code, and is the kind of thing that ends up pasted into a bug report or crash dump
by accident. Reading the key from one file that only `server.js` opens keeps it contained to
exactly the process that needs it. If you'd rather use a direct bearer-token `"type": "http"` entry
anyway (e.g. to match a setup you already have), see the
[`local-mcp-server/`](../local-mcp-server/README.md) README for that option instead of this plugin.

## Updating

Bump `version` in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) and in this repo's
[`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) when you change
anything here, so installs on other machines actually pick up the update. If you change
`server.js`'s dependencies, also run `npm install` in this directory and commit the updated
`package-lock.json` — Claude Code only reinstalls a plugin's dependencies when the lockfile changes.
