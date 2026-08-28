# cheatsheet MCP server (local example)

There are four ways to reach the cheatsheet from an MCP client — pick based on how you want the
API key supplied:

- **Claude Code plugin, key from a shell env var:** [`../claude-plugin`](../claude-plugin) —
  packages the same hosted connector as an installable plugin (`/plugin marketplace add`), so you
  don't hand-edit `.mcp.json` per project. Same shell-env-var requirement as the option below,
  since it's the same `"type": "http"` entry under the hood.
- **Hosted connector, key from a shell env var:** add `https://cheats.aarontrotter.com/mcp`
  directly as a remote `"type": "http"` server, with `Authorization: Bearer ${CHEATSHEET_API_KEY}`
  in `headers`. No local process at all, but `${CHEATSHEET_API_KEY}` only expands from a real
  environment variable already set before Claude Code starts — Claude Code has no way to read it
  out of a file for an `http`-type entry. See the "MCP Connector" section of
  [/api-docs](https://cheats.aarontrotter.com/api-docs).
- **Hosted connector, key from `.env.local`:** [`../live-proxy.js`](../live-proxy.js) — a small
  local stdio process that reads `.env.local` the same way this script does, then transparently
  forwards every call to the live connector above. Same "no secret in `.mcp.json`" property as
  this local script, but backed by the real hosted connector instead of a REST re-implementation.
- **This script:** for a project that wants to run its own variant — modify the tool set, add
  project-specific logic, or run fully offline against the REST API. It wraps the cheatsheet's own
  `/mcp/*` REST API (see `functions/routes/db/mcp.js` in the
  [cheatsheet](https://github.com/AaronTrotter/cheatsheet) repo) as MCP tools (`search_cheats`, `get_cheat`,
  `get_revisions`, `add_cheat`, `update_cheat`, `delete_cheat`) over stdio, so Claude Code can
  browse or update your cheats without an API key ever being typed into a chat.

## One-time setup

1. **Create an API key.** Sign in at the cheatsheet, go to `/user` → API Access, and create a key.
   Which scope to grant depends on the project this is wired into:
   - **Read-only** if you just want your cheats available as reference material.
   - **Read + write** if you also want Claude to be able to save notes as new cheats or revise
     existing ones.
2. **Install dependencies** (already done if you just cloned this): `npm install` in this
   directory.
3. **Create `.env.local` at the repo root** (not in this directory) with `CHEATSHEET_API_KEY=...`
   pasted in. `.mcp.json` points the server at it via `CHEATSHEET_ENV_FILE`. Root `.env.local` is
   gitignored and is denied to Claude's own Read/Grep/sandboxed-Bash access via
   [`.claude/settings.json`](../.claude/settings.json) — it never appears in chat, in `.mcp.json`,
   or in any shell environment variable.
4. Restart Claude Code (or start a new session) in this project. It will detect `.mcp.json` and
   prompt you to approve the `cheatsheet` server the first time.

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
`local-mcp-server/.env.local`) — this repo's own `.mcp.json` sets the override too,
pointing at its root `.env.local` instead, so every project (this one included) follows the same
root-level convention.

## Tools exposed

| Tool | Maps to | Scope required |
|---|---|---|
| `search_cheats` | `GET /mcp/search` | read |
| `get_cheat` | `GET /mcp/getCheat` | read |
| `get_revisions` | `GET /mcp/getRevisions` | read |
| `add_cheat` | `POST /mcp/addCheat` | write |
| `update_cheat` | `POST /mcp/updateCheat` | write |
| `delete_cheat` | `POST /mcp/deleteCheat` | write |

A key without the required scope gets a normal 401 from the API — the server has no scope logic
of its own, it just forwards the key and reports back whatever the API says.

`search_cheats`, `get_cheat`, `add_cheat`, and `update_cheat` all add a `url` field (not part of
the underlying API response) pointing at the cheat's page — `<CHEATSHEET_SITE_URL>/?code=<id>`,
matching how the browser itself links to a cheat (see `public/js/script.js`). Defaults to
`https://cheats.aarontrotter.com`; override with `CHEATSHEET_SITE_URL` if that ever changes.
