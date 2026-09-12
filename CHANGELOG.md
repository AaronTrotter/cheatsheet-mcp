# Changelog

All notable changes to this repository are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the repository version follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Note that the Claude Code plugin under [`claude-plugin/`](claude-plugin/) carries its own version
number, declared in both `claude-plugin/.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`, because that is what a `/plugin update` on someone else's
machine compares against. It moves only when something inside that directory changes, so it does
not track the repository version. Each entry below records where the plugin stood at that release.

## [Unreleased]

### Added

- Five Dues tools in `local-mcp-server/`, mirroring the five the hosted MCP Connector gained in
  the same change: `search_dues`, `get_due`, `get_dues_summary`, `add_due` and `mark_due_paid`.
  Dues is a new private section on Cheatsheet recording money other people owe the user, with a
  payer, the recurring services they are billed for, and each amount owed. Freezing a payer,
  sending a payment reminder and editing a due are deliberately absent from both surfaces: the
  first two act on a real client, and the third reprices every future charge. Note that
  `mark_due_paid` can raise the next charge as a side effect on a service set to recur only after
  payment, returning it as `rolledChildID`.

### Changed

- Projects tool descriptions in `local-mcp-server/` now cover shared boards, matching the hosted
  MCP Connector. A project on Cheatsheet can be shared with other people by email invite, so
  `search_projects` returns boards shared with the user alongside their own, each carrying a
  `role` of `owner`, `editor` or `viewer`, and the card tools act on any board the user can
  write to rather than only ones they created. No tool was added, removed or reshaped: the
  endpoints behind them changed behaviour, and these descriptions had said "a card you own",
  which is no longer what they do.

## [1.3.0] - 2026-09-07

Plugin version at this release: 2.0.0 (unchanged).

### Added

- Five Brain tools in `local-mcp-server/`, matching the hosted MCP Connector: `search_brain` and
  `get_brain` (read), `add_brain`, `update_brain` and `delete_brain` (write). Brain was already
  reachable through the task tools by passing `section` or `categories`, so these add no reach;
  they exist so an assistant's own memory is a tool it can find rather than an argument it has to
  know to pass, and they refuse an id belonging to a task, so deleting a `memory` can never
  quietly delete a note instead. `add_brain` defaults to the `memory` category.
- Eight Projects tools, also matching the hosted connector: `search_projects`,
  `search_project_tasks` and `get_project_task` (read), `add_project`, `add_project_task`,
  `update_project_task`, `move_project_task` and `delete_project_task` (write). Projects is the
  user's Kanban board, and `move_project_task` is the one to use for a progress update because it
  keeps the card's id, where `update_project_task` is an append-only revision that returns a new
  one.
- Renaming a project, deleting a whole project and card sharing are deliberately not exposed. A
  rename has no caller asking for it, deleting a project ceases every card on it at once, and
  sharing hands a card to people outside the account.

### Changed

- The tool set is now thirty tools rather than seventeen. Both READMEs and the tool table are
  updated to match.
- **Breaking:** the task tools now cover Tasks only. Tasks and Brain have diverged into separate
  sections, so `search_tasks`, `get_task`, `add_task`, `update_task` and `delete_task` no longer
  reach a Brain entry, and the brain tools do not reach a task. An id addressed through the wrong
  section's tool comes back as a 404 instead of quietly working, and a category from the wrong
  section is a 400.
- **Breaking:** `search_tasks` drops its `section` and `categories` arguments for a single
  `category` (`note` or `list`), matching `search_brain`'s shape. Anything that previously called
  it with `section: 'brain'` or a Brain category should call the matching brain tool instead.
- API keys can now be limited to particular sections of the app on `/user`. This script is
  unaffected in what it registers (all thirty tools, since nothing tells a key its own sections),
  but a call outside a narrowed key's sections now returns 403. The hosted connector does narrow
  its tool list to match the key, so prefer it when that matters.
- `add_task` and `update_task` now accept only `note` and `list`. `update_task` and `update_brain`
  carry the item's existing category forward when none is given, so an edit that omits the field
  can no longer move an item between sections.

## [1.2.0] - 2026-09-06

Plugin version at this release: 2.0.0 (unchanged).

### Added

- Five Pennies tools in `local-mcp-server/`, matching the hosted MCP Connector: `search_pennies`
  and `get_penny_summary` (read), `add_penny`, `fill_penny` and `void_penny` (write). Pennies is
  the user's own private log of investment orders across crypto, stocks, ETFs, bonds, commodities
  and CFDs, plus the portfolio derived from it.
- `get_penny_summary` takes an optional `taxYear`, whose boundaries follow the user's own country
  rather than assuming a calendar year, so a UK tax year correctly runs 6 April to 5 April.

### Changed

- The tool set is now seventeen tools rather than twelve. Both READMEs and the tool table are
  updated to match.

### Notes

- Pennies was deliberately absent from the API surface until now, on the grounds that a private
  financial log should not be reachable by a key. It is now reachable on the same terms as
  everything else: a read-only key can read it but cannot change it, so issuing read-only keys is
  how an integration is kept out of it.
- A logged order is immutable, so there is no `update_penny`. `fill_penny` confirms that a pending
  limit order executed, and `void_penny` is the only way an order is removed.
- `live-proxy.js` and the Claude Code plugin needed no change: the proxy forwards `tools/list` and
  `tools/call` rather than re-implementing them, so it picks up the new tools automatically.

## [1.1.1] - 2026-09-06

Plugin version at this release: 2.0.0 (unchanged).

### Changed

- Documentation only: no tool, argument or behaviour in this repository changed. Cheatsheet has
  split Tasks and Brain into two Firestore collections (`tasks` and `brain`) so that each carries
  its own Free-tier cap of 5 items, instead of the two sharing one allowance between them. The task
  tools are unaffected, because the split sits behind one shared set of REST endpoints and every
  tool still addresses an item by id or by category. `local-mcp-server/README.md` and the
  tool-registration comment in `local-mcp-server/index.js` both described the old single-collection
  model and now describe the new one, including the per-page cap. The 1.1.0 entry below is left as
  written, since it was accurate at that release.

## [1.1.0] - 2026-09-05

Plugin version at this release: 2.0.0 (unchanged).

### Added

- `local-mcp-server/index.js` now registers the six Task and Brain tools — `search_tasks`,
  `get_task`, `add_task`, `update_task`, `delete_task` and `get_guides` — bringing it to the same
  twelve tools the hosted MCP Connector exposes. Previously it covered cheats only, so switching a
  project between the local server and any of the hosted paths silently changed what an agent
  could reach. The task tools span both the Tasks and Brain pages, which are one collection
  server-side split by `category`; `search_tasks` takes a `section` argument to narrow to one.
- `get_guides` returns the user's `brief` and `rules` entries as one formatted block. The hosted
  connector sends that same text as its `instructions` on connect, but a stdio server has no
  equivalent hook, so this server exposes it as a tool to call explicitly.

### Changed

- Both READMEs now describe the full twelve-tool set instead of documenting the local server as
  cheats-only, and `local-mcp-server/README.md` is reframed around what it is actually for: the
  path to start from when you want to change the tool set, since it wraps the REST API rather than
  forwarding to the hosted connector.
- Corrected the README's note about the synthesized `url` field, which is added by every cheat tool
  except `delete_cheat` — including `get_revisions`, which was previously omitted.

## [1.0.0] - 2026-08-31

Plugin version at this release: 2.0.0.

### Added

- `live-proxy.js`, a stdio MCP proxy in front of the hosted `/mcp` Streamable HTTP connector, which
  loads the API key from a gitignored `.env.local` rather than requiring a shell environment
  variable that every process under the same OS user could read.
- `local-mcp-server/index.js`, a standalone stdio server wrapping the cheatsheet's REST `/mcp/*`
  API directly, kept as a customizable reference for projects that want their own variant.
- `claude-plugin/`, a Claude Code plugin bundling its own copy of the proxy, distributed through
  the `cheatsheet-mcp` marketplace in `.claude-plugin/marketplace.json`.
- Documentation for reaching the cheatsheet from claude.ai, Claude Desktop, and mobile as a custom
  connector, none of which need a local process.

### Changed

- The plugin reads its API key from a file in Claude Code's persistent plugin data directory
  instead of a bearer token in an environment variable, so the key survives `/plugin update` and
  stays readable only by the one script that needs it. Released as plugin 2.0.0.
