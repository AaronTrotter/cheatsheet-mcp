# Changelog

All notable changes to this repository are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the repository version follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Note that the Claude Code plugin under [`claude-plugin/`](claude-plugin/) carries its own version
number, declared in both `claude-plugin/.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`, because that is what a `/plugin update` on someone else's
machine compares against. It moves only when something inside that directory changes, so it does
not track the repository version. Each entry below records where the plugin stood at that release.

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
