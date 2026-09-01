# cheatsheet MCP server (local example)

A standalone local MCP server that wraps the cheatsheet's own REST API directly, instead of
forwarding to the hosted connector — a customizable starting point for a project that wants to
modify the tool set or run its own variant. This is one path under Option B (run a local MCP
server); see the [root README](../README.md) for the full menu, including Option A for claude.ai,
Desktop, and mobile, which needs no local install at all.

**Covers cheats only, not Tasks** — unlike every other way to connect (the hosted MCP Connector,
the Claude Code plugin, and the MCP proxy all expose Task tools too). Add Task tools yourself here
if you need them; see `functions/routes/db/mcp.js` in the
[cheatsheet](https://github.com/AaronTrotter/cheatsheet) repo for the underlying `/mcp/searchTasks`
etc. endpoints to wrap.

It exposes the cheat endpoints as MCP tools (`search_cheats`, `get_cheat`, `get_revisions`,
`add_cheat`, `update_cheat`, `delete_cheat`) over stdio, so Claude Code can browse or update your
cheats without an API key ever being typed into a chat.

For the other two Option B paths — the [Claude Code plugin](../claude-plugin/README.md) or the
[MCP proxy](https://cheats.aarontrotter.com/api-docs/mcp-proxy-setup), both of which do reach
Tasks — see their own docs instead of this one.

## One-time setup

1. **Create an API key.** Sign in at the cheatsheet, go to `/user` → API Access, and create a key.
   Which scope to grant depends on the project this is wired into:
   - **Read-only** if you just want your cheats available as reference material.
   - **Read + write** if you also want Claude to be able to save notes as new cheats or revise
     existing ones.
2. **Install dependencies** (already done if you just cloned this): `npm install` in this
   directory.
3. **Create `.env.local` in this directory** with `CHEATSHEET_API_KEY=...` pasted in. It's
   gitignored, and denied to Claude's own Read/Grep/sandboxed-Bash access via
   [`../.claude/settings.json`](../.claude/settings.json) — it never appears in chat, in
   `.mcp.json`, or in any shell environment variable.
4. Add a `.mcp.json` in whichever project you want to use this from (see
   [below](#using-this-from-another-project)) and restart Claude Code there. It will detect
   `.mcp.json` and prompt you to approve the `cheatsheet` server the first time.

## Using this from another project

This script is meant to be pointed at from other projects, not copied. Each project keeps its own
key file (so it can be scoped read-only or read+write independently, and protected by that
project's own deny rules) while reusing this one server.

In the other project's `.mcp.json`, at that project's own root:

```json
{
  "mcpServers": {
    "cheatsheet": {
      "command": "node",
      "args": ["H:/Web/Projects/cheats-mcp/local-mcp-server/index.js"],
      "env": {
        "CHEATSHEET_ENV_FILE": ".env.local"
      }
    }
  }
}
```

`CHEATSHEET_ENV_FILE` is just a path, not a secret, so it's fine to commit — a relative path
resolves against that project's own root (its working directory when Claude Code launches the
server), so `.env.local` here means a root-level file in *that* project, not this one. Then in
that project:

1. Create `.env.local` at that project's root with `CHEATSHEET_API_KEY=...`, using whichever scope
   makes sense for that project. Most project `.gitignore` templates already exclude a root
   `.env.local` by default — check before assuming you need to add a rule.
2. Add the same protections this repo has in its own `.claude/settings.json`: `Read`/`Grep`
   deny rules for `.env.local`, and a `sandbox.credentials.files` entry with `mode: "deny"` — see
   [`../.claude/settings.json`](../.claude/settings.json) for the pattern to copy.
3. Restart Claude Code in that project and approve the `cheatsheet` server when prompted.

Without a `CHEATSHEET_ENV_FILE` override it defaults to `.env.local` next to `index.js` (i.e.
`local-mcp-server/.env.local`, the file from step 3 of one-time setup above) — this repo itself has
no `.mcp.json` of its own, since it isn't a project that needs to browse cheats; the convention
above is what *other* projects should follow when pointing at this script.

## Tools exposed

| Tool | Maps to | Scope required |
|---|---|---|
| `search_cheats` | `GET /mcp/search` | read |
| `get_cheat` | `GET /mcp/getCheat` | read |
| `get_revisions` | `GET /mcp/getRevisions` | read |
| `add_cheat` | `POST /mcp/addCheat` | write |
| `update_cheat` | `POST /mcp/updateCheat` | write |
| `delete_cheat` | `POST /mcp/deleteCheat` | write |

No Task tools (`search_tasks`, `get_task`, `add_task`, `update_task`, `delete_task`) — see the note
at the top of this README.

A key without the required scope gets a normal 401 from the API — the server has no scope logic
of its own, it just forwards the key and reports back whatever the API says.

`search_cheats`, `get_cheat`, `add_cheat`, and `update_cheat` all add a `url` field (not part of
the underlying API response) pointing at the cheat's page — `<CHEATSHEET_SITE_URL>/?code=<id>`,
matching how the browser itself links to a cheat (see `public/js/script.js`). Defaults to
`https://cheats.aarontrotter.com`; override with `CHEATSHEET_SITE_URL` if that ever changes.
