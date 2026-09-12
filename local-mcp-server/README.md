# cheatsheet MCP server (local example)

A standalone local MCP server that wraps the cheatsheet's own REST API directly, instead of
forwarding to the hosted connector — a customizable starting point for a project that wants to
modify the tool set or run its own variant. This is one path under Option B (run a local MCP
server); see the [root README](../README.md) for the full menu, including Option A for claude.ai,
Desktop, and mobile, which needs no local install at all.

It exposes all thirty-five `/mcp/*` endpoints as MCP tools over stdio — cheats (`search_cheats`,
`get_cheat`, `get_revisions`, `add_cheat`, `update_cheat`, `delete_cheat`), Tasks
(`search_tasks`, `get_task`, `add_task`, `update_task`, `delete_task`), Brain (`search_brain`,
`get_brain`, `add_brain`, `update_brain`, `delete_brain`), Pennies (`search_pennies`,
`get_penny_summary`, `add_penny`, `fill_penny`, `void_penny`), Projects (`search_projects`,
`add_project`, `search_project_tasks`, `get_project_task`, `add_project_task`,
`update_project_task`, `move_project_task`, `delete_project_task`), Dues (`search_dues`,
`get_due`, `get_dues_summary`, `add_due`, `mark_due_paid`) and `get_guides` — so Claude
Code can browse or update your cheats, tasks, board, investment log and what you are owed without
an API key ever being typed into a chat.
That's the same tool set the hosted MCP Connector, the Claude Code plugin, and the MCP proxy
expose, so switching between them doesn't change what an agent can do.

Because this one wraps the REST API rather than forwarding to the hosted connector, it's the path
to start from if you want to *change* that tool set — drop tools you don't want, or reshape their
arguments. See `functions/routes/db/mcp.js` in the
[cheatsheet](https://github.com/AaronTrotter/cheatsheet) repo for the underlying endpoints.

For the other two Option B paths, see the [Claude Code plugin](../claude-plugin/README.md) or the
[MCP proxy](https://cheats.aarontrotter.com/api-docs/mcp-proxy-setup) docs instead of this one.

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
| `search_tasks` | `GET /mcp/searchTasks` | read |
| `get_task` | `GET /mcp/getTask` | read |
| `get_guides` | `GET /mcp/getGuides` | read |
| `add_task` | `POST /mcp/addTask` | write |
| `update_task` | `POST /mcp/updateTask` | write |
| `delete_task` | `POST /mcp/deleteTask` | write |
| `search_brain` | `GET /mcp/searchBrain` | read |
| `get_brain` | `GET /mcp/getBrain` | read |
| `add_brain` | `POST /mcp/addBrain` | write |
| `update_brain` | `POST /mcp/updateBrain` | write |
| `delete_brain` | `POST /mcp/deleteBrain` | write |
| `search_pennies` | `GET /mcp/searchPennies` | read |
| `get_penny_summary` | `GET /mcp/getPennySummary` | read |
| `add_penny` | `POST /mcp/addPenny` | write |
| `fill_penny` | `POST /mcp/fillPenny` | write |
| `void_penny` | `POST /mcp/voidPenny` | write |
| `search_projects` | `GET /mcp/searchProjects` | read |
| `add_project` | `POST /mcp/addProject` | write |
| `search_project_tasks` | `GET /mcp/searchProjectTasks` | read |
| `get_project_task` | `GET /mcp/getProjectTask` | read |
| `add_project_task` | `POST /mcp/addProjectTask` | write |
| `update_project_task` | `POST /mcp/updateProjectTask` | write |
| `move_project_task` | `POST /mcp/moveProjectTask` | write |
| `delete_project_task` | `POST /mcp/deleteProjectTask` | write |
| `search_dues` | `GET /mcp/searchDues` | read |
| `get_due` | `GET /mcp/getDue` | read |
| `get_dues_summary` | `GET /mcp/getDuesSummary` | read |
| `add_due` | `POST /mcp/addDue` | write |
| `mark_due_paid` | `POST /mcp/markDuePaid` | write |

The task tools and the brain tools cover two separate sections, not one list with a filter. Tasks
holds the user's own notes and checklists (`note`, `list`); Brain holds what an assistant works
from (`brief` for context, `rules` for constraints, `memory` for what it records for itself).
Server-side these are two Firestore collections behind one shared route file, and each carries its
own Free-tier cap of 5 items, but on this surface they are simply separate: the task tools reach
nothing in Brain, the brain tools reach nothing in Tasks, and an id addressed through the wrong
section's tool comes back as a 404 rather than quietly working. So deleting a `memory` can never
delete a shopping list instead, and an assistant tidying up notes can never touch the rules the
user wrote for it. `add_brain` defaults to the `memory` category, which is the one an assistant
writes for itself: `brief` and `rules` are the user's own guidance, so write those only when
asked. `get_guides` returns the user's
`brief` and `rules` entries as one formatted block, the same text the hosted connector sends as its
`instructions` on connect; this server has no equivalent hook, so call it explicitly when you want
that context.

The project tools cover the user's Kanban board: `projects` are the boards, and each card belongs
to one and carries the `status` deciding its column (`open`, `in-progress`, `in-review`). There is
no done column, so `delete_project_task` is how a finished card leaves the board. Use
`move_project_task` for a progress update, since it keeps the card's id, where `update_project_task`
is an append-only revision that returns a new one. Renaming a project, deleting a whole project and
card sharing are deliberately not exposed here: the first has no caller asking for it, the second
would cease every card on the board at once, and the third hands a card to people outside the
account, which belongs on the page where the allow-list is visible.

The Pennies tools cover the user's own log of investment orders (crypto, stocks, ETFs, bonds,
commodities and CFDs) and the portfolio derived from it. `search_pennies` returns the raw orders;
`get_penny_summary` returns positions, cost basis on the moving-average method, realized profit and
fees, optionally narrowed to one tax year whose boundaries follow the user's country. A logged order
is immutable, so there is no `update_penny`: `fill_penny` confirms a pending limit order executed,
and `void_penny` is the only way one is removed. These are financial records, so log only what the
user has actually stated and never guess a price, quantity or date. A read-only key can read this
section but cannot change it, which is how you keep an integration out of it entirely.

The Dues tools cover what other people owe the user: a payer is a client or a tenant, a service is
one recurring thing they are billed for, and a due is one amount owed on one date. `search_dues`
returns the raw ledger, unpaid before paid and oldest first within each, with `overdue` and
`daysOverdue` worked out from the date at the moment you ask rather than stored, so they are never
stale. `get_dues_summary` returns the balances and a per-payer breakdown carrying each payer's
oldest unpaid date and whether they are frozen, which is what tells you who is worth chasing.

Three things the browser can do that these tools deliberately cannot. Freezing a payer stops
billing a real client, and sending a payment reminder puts an email in front of them, so both stay
behind a button a person presses. Editing a due is the third, and the reason is less obvious: each
new due is priced at whatever the previous one for that service was priced at, so editing a raised
but unpaid due reprices every future one. `mark_due_paid` is the one tool here with a side effect
worth knowing about, since on a service that recurs only after payment it also raises the next one
straight away and returns its id as `rolledChildID`. These are financial records about somebody
else, so record only what the user has actually stated, and never guess an amount or a date.

A key without the required scope gets a normal 401 from the API — the server has no scope logic
of its own, it just forwards the key and reports back whatever the API says.

The same goes for a key limited to particular sections of the app (Cheats, Tasks, Brain, Pennies,
Projects, Dues, chosen when the key is created on `/user`): calls outside its sections come back as a 403
naming the section. Note the difference from the hosted MCP Connector here. The connector knows the
key's sections at connect time and only offers the tools that key can use, so a narrow key gets a
short tool list. This script registers all thirty-five tools whatever the key is, because nothing in the
API tells a key what it is scoped to — so with a narrowed key, some of the tools it advertises will
answer 403. Prefer the hosted connector when you want the tool list to match the key.

Every cheat tool except `delete_cheat` adds a `url` field (not part of the underlying API response)
pointing at the cheat's page — per result for `search_cheats`, per revision for `get_revisions`,
top-level for `get_cheat`/`add_cheat`/`update_cheat` — `<CHEATSHEET_SITE_URL>/?code=<id>`,
matching how the browser itself links to a cheat (see `public/js/script.js`). Defaults to
`https://cheats.aarontrotter.com`; override with `CHEATSHEET_SITE_URL` if that ever changes.
