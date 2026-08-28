# cheatsheet Claude Code plugin

Packages the hosted `https://cheats.aarontrotter.com/mcp` connector (see
`functions/routes/db/mcpConnector.js` in the [cheatsheet](https://github.com/AaronTrotter/cheatsheet)
repo) as an installable Claude Code plugin, so a project doesn't need its own hand-edited
`.mcp.json` entry. This is the same connector [`../local-mcp-server/README.md`](../local-mcp-server/README.md)
calls the "hosted connector, key from a shell env var" option — see that doc for how the other
options (the file-backed `live-proxy.js`, and the standalone REST-backed `local-mcp-server`)
compare.

PC/Claude Code only — Claude Code plugins don't run on the Claude mobile app. For phone access,
see [`../local-mcp-server/README.md`](../local-mcp-server/README.md#mobile--claudeai) instead;
it's the same bearer-token setup, just added as a claude.ai custom connector rather than installed
here.

## Install

1. In any project, run:
   ```
   /plugin marketplace add AaronTrotter/cheatsheet-mcp
   /plugin install cheatsheet@cheatsheet-mcp
   ```
2. Set `CHEATSHEET_API_KEY` in your shell environment (not a file — see below for why) before
   starting Claude Code, using an API key created at `/user` → API Access on the cheatsheet site.
3. Restart Claude Code (or `/reload-plugins`) and approve the `cheatsheet` MCP server when
   prompted.

## Why a real env var, not `.env.local`

Claude Code only expands `${CHEATSHEET_API_KEY}` in an `"type": "http"` `.mcp.json` entry from a
real environment variable set before Claude Code starts — there's no way for the plugin's bundled
`.mcp.json` to read a key out of a gitignored file itself. If you'd rather keep the key in a file,
skip this plugin and wire up `../live-proxy.js` by hand per
[`../local-mcp-server/README.md`](../local-mcp-server/README.md) instead; it's a stdio proxy in
front of the same hosted connector.

## Updating

Bump `version` in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) and in this repo's
[`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) when you change
anything here, so installs on other machines actually pick up the update.
