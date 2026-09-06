#!/usr/bin/env node
// Local MCP server wrapping the cheatsheet's own /mcp/* HTTP API (see
// functions/routes/db/mcp.js and functions/routes/db/apiKeys.js in the cheatsheet repo). Runs
// over stdio and is meant to be launched by an MCP client (e.g. Claude Code).
//
// The API key lives only in a .env.local file (gitignored, and denied to Claude's own
// Read/Grep/sandboxed-Bash access via that project's .claude/settings.json) — never in an MCP
// client config, a shell env var, or anything typed in chat. Which key goes in there (read-only
// vs read+write) is a per-project decision: use a read-only key when you just want the cheatsheet
// available as reference material, or a read+write key when you also want it usable as a scratch
// memory.
//
// This same script is meant to be reused across projects rather than copied — a project other
// than this one should point its own .mcp.json at this file's absolute path and set
// CHEATSHEET_ENV_FILE (a path, not a secret — safe to commit) to a .env.local living inside that
// other project, so each project keeps its own differently-scoped key under its own deny rules.
// With no override, it defaults to .env.local next to this script, i.e. this repo's own key.

const fs = require('fs');
const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

function loadEnvLocal(filePath) {
	if (!fs.existsSync(filePath)) return {};
	const vars = {};
	for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		vars[key] = value;
	}
	return vars;
}

const envFilePath = process.env.CHEATSHEET_ENV_FILE
	? path.resolve(process.env.CHEATSHEET_ENV_FILE)
	: path.join(__dirname, '.env.local');
const envLocal = loadEnvLocal(envFilePath);

const API_URL = (envLocal.CHEATSHEET_API_URL || process.env.CHEATSHEET_API_URL || 'https://cheats.aarontrotter.com').replace(/\/+$/, '');
const API_KEY = envLocal.CHEATSHEET_API_KEY || process.env.CHEATSHEET_API_KEY;
// The public site (for building clickable links to a cheat) can differ from API_URL — the site
// lives at a custom domain while the API is called at the underlying Firebase Hosting domain.
// A cheat's own page is always <SITE_URL>/?code=<id> (see public/js/script.js's share/open links).
const SITE_URL = (envLocal.CHEATSHEET_SITE_URL || process.env.CHEATSHEET_SITE_URL || 'https://cheats.aarontrotter.com').replace(/\/+$/, '');

function cheatUrl(id) {
	return `${SITE_URL}/?code=${encodeURIComponent(id)}`;
}

if (!API_KEY) {
	console.error(`CHEATSHEET_API_KEY is not set — add it to ${envFilePath} (see local-mcp-server/README.md for setup).`);
	process.exit(1);
}

async function callApi(method, path, { query, body } = {}) {
	const url = new URL(API_URL + path);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
		}
	}

	const response = await fetch(url, {
		method,
		headers: {
			'Authorization': `Bearer ${API_KEY}`,
			// Lets the server's usage analytics attribute this traffic to local-mcp-server
			// specifically, rather than lumping it in with every other unlabeled API caller —
			// see functions/dbHelpers.js's getClientId in the cheatsheet repo. Purely
			// informational, safe for an older server that doesn't recognize it to ignore.
			'X-Cheatsheet-Client': 'local-mcp-server',
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});

	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(data.error || `Cheatsheet API returned ${response.status}`);
	}
	return data;
}

function textResult(data) {
	return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({ name: 'cheatsheet', version: '1.0.0' });

server.registerTool(
	'search_cheats',
	{
		title: 'Search cheats',
		description: 'Search the cheatsheet for cheats matching a query. Returns id, title, type, a text snippet, a clickable url, and star/point counts for each match, plus total/hasMore for pagination — pass a higher page to fetch more results beyond the first page.',
		inputSchema: {
			query: z.string().optional().describe('Search text; omit to list the most recent cheats.'),
			type: z.string().optional().describe('Restrict to one type/category name.'),
			limit: z.number().int().min(1).max(25).optional().describe('Max results per page (default 8, max 25).'),
			page: z.number().int().min(0).optional().describe('0-indexed page number (default 0). Use when a previous call\'s hasMore was true.')
		}
	},
	async ({ query, type, limit, page }) => {
		const data = await callApi('GET', '/mcp/search', { query: { q: query, type, limit, page } });
		data.results = (data.results || []).map(result => ({ ...result, url: cheatUrl(result.id) }));
		return textResult(data);
	}
);

server.registerTool(
	'get_cheat',
	{
		title: 'Get cheat',
		description: 'Fetch the full body of one cheat by id (as returned by search_cheats). Includes a clickable url.',
		inputSchema: {
			id: z.string().describe('The cheat id.')
		}
	},
	async ({ id }) => {
		const data = await callApi('GET', '/mcp/getCheat', { query: { id } });
		data.url = cheatUrl(data.id);
		return textResult(data);
	}
);

server.registerTool(
	'get_revisions',
	{
		title: 'Get revision history',
		description: 'List the full append-only revision history for a cheat\'s lineage. Any id belonging to it works, not just the original. Exactly one revision has ceased:false — that\'s the current version; the rest are prior edits kept for history.',
		inputSchema: {
			id: z.string().describe('Id of any revision in the lineage.')
		}
	},
	async ({ id }) => {
		const data = await callApi('GET', '/mcp/getRevisions', { query: { id } });
		data.revisions = (data.revisions || []).map(revision => ({ ...revision, url: cheatUrl(revision.id) }));
		return textResult(data);
	}
);

server.registerTool(
	'add_cheat',
	{
		title: 'Add cheat',
		description: 'Create a new cheat. Requires a write-scoped API key. Starts with 0 stars/points.',
		inputSchema: {
			title: z.string().max(40).describe('Cheat title (max 40 chars).'),
			typeName: z.string().describe('Type/category name; created if it doesn\'t already exist.'),
			text: z.string().describe('The cheat body text.'),
			private: z.boolean().describe('Whether the cheat is private to this account.')
		}
	},
	async ({ title, typeName, text, private: isPrivate }) => {
		const data = await callApi('POST', '/mcp/addCheat', {
			body: { title, typeName, body: { text }, private: isPrivate }
		});
		data.url = cheatUrl(data.id);
		return textResult(data);
	}
);

server.registerTool(
	'update_cheat',
	{
		title: 'Update cheat',
		description: 'Revise an existing cheat you own. Requires a write-scoped API key. This is append-only under the hood: the old revision is marked ceased and a new one is created and returned.',
		inputSchema: {
			id: z.string().describe('Id of the cheat to revise.'),
			title: z.string().max(40).describe('New title (max 40 chars).'),
			typeName: z.string().describe('New type/category name.'),
			text: z.string().describe('New cheat body text.'),
			private: z.boolean().describe('Whether the revised cheat is private to this account.')
		}
	},
	async ({ id, title, typeName, text, private: isPrivate }) => {
		const data = await callApi('POST', '/mcp/updateCheat', {
			body: { id, title, typeName, body: { text }, private: isPrivate }
		});
		data.url = cheatUrl(data.id);
		return textResult(data);
	}
);

server.registerTool(
	'delete_cheat',
	{
		title: 'Delete cheat',
		description: 'Delete a cheat you own. Requires a write-scoped API key. Not a hard delete — the cheat is marked ceased and stops appearing in search/get, but the record and its revision history aren\'t erased. Fails with a 403 if you don\'t own it.',
		inputSchema: {
			id: z.string().describe('Id of the cheat to delete.')
		}
	},
	async ({ id }) => {
		const data = await callApi('POST', '/mcp/deleteCheat', { body: { id } });
		return textResult(data);
	}
);

// Tasks/Brain tools, mirroring the hosted connector's (functions/routes/db/mcpConnector.js in the
// cheatsheet repo) so both surfaces expose the same set. The two pages have a Firestore collection
// each (`tasks`, `brain`) behind one shared set of endpoints, and the `category` decides which an
// item belongs to: note/list appear in Tasks, brief/rules/memory in Brain. That split is invisible
// from here — every tool below still addresses an item by id or category, exactly as before.
const TASK_CATEGORIES = ['note', 'list', 'brief', 'rules', 'memory'];
const TASK_SECTIONS = ['tasks', 'brain'];

server.registerTool(
	'search_tasks',
	{
		title: 'Search tasks',
		description: 'Search the user\'s private Tasks and Brain entries (to-do lists, notes, and the guidance and memories kept separate from cheats). Returns id, title, category, text, expiresAtMs (null if permanent), and createdDateMs for each match, plus totalPages for pagination. Searches every category unless you narrow it.',
		inputSchema: {
			query: z.string().optional().describe('Search text matched against title/text/category; omit to list the most recently created items.'),
			section: z.enum(TASK_SECTIONS).optional().describe('Restrict to one page\'s categories: \'tasks\' for note/list, \'brain\' for brief/rules/memory.'),
			categories: z.string().optional().describe('Comma-separated category names to restrict to, e.g. \'memory\'. Takes precedence over section.'),
			page: z.number().int().min(1).optional().describe('1-indexed page number (default 1).')
		}
	},
	async ({ query, section, categories, page }) => {
		return textResult(await callApi('GET', '/mcp/searchTasks', { query: { q: query, section, categories, page } }));
	}
);

server.registerTool(
	'get_task',
	{
		title: 'Get task',
		description: 'Fetch one task or Brain entry by id (as returned by search_tasks).',
		inputSchema: {
			id: z.string().describe('The task id.')
		}
	},
	async ({ id }) => {
		return textResult(await callApi('GET', '/mcp/getTask', { query: { id } }));
	}
);

server.registerTool(
	'get_guides',
	{
		title: 'Get guides',
		description: 'Fetch the user\'s standing guidance from their Brain: \'brief\' entries give orienting context, \'rules\' are hard constraints to follow. Worth calling once at the start of a session, and again if the user says they have changed their guidance.',
		inputSchema: {}
	},
	async () => {
		const data = await callApi('GET', '/mcp/getGuides');
		return { content: [{ type: 'text', text: data.guides || 'This user has not written any guides yet.' }] };
	}
);

server.registerTool(
	'add_task',
	{
		title: 'Add task',
		description: 'Create a new Task or Brain entry. Requires a write-scoped API key. Always private, never appears in cheat search.',
		inputSchema: {
			title: z.string().max(40).describe('Title (max 40 chars).'),
			category: z.enum(TASK_CATEGORIES).optional().describe('Category, which also decides where it appears for the user. The Tasks page shows \'note\' and \'list\'; the Brain page shows \'brief\' (context you should know), \'rules\' (constraints you must follow) and \'memory\' (things you record for yourself). Use \'memory\' when saving something you worked out; leave \'brief\' and \'rules\' to the user. Defaults to note.'),
			text: z.string().describe('The body text.'),
			duration: z.enum(['permanent', '1h', '1d', '1w']).optional().describe('Auto-expiry: permanent (default), 1h, 1d, or 1w. An expired item is automatically deleted (soft-ceased).')
		}
	},
	async ({ title, category, text, duration }) => {
		return textResult(await callApi('POST', '/mcp/addTask', { body: { title, category, text, duration } }));
	}
);

server.registerTool(
	'update_task',
	{
		title: 'Update task',
		description: 'Revise a task or Brain entry you own. Requires a write-scoped API key. Append-only under the hood like update_cheat, but these have no visible revision history — this always returns the one current item.',
		inputSchema: {
			id: z.string().describe('Id of the item to revise.'),
			title: z.string().max(40).describe('New title (max 40 chars).'),
			category: z.enum(TASK_CATEGORIES).optional().describe('New category: note or list (Tasks page), or brief, rules or memory (Brain page). Defaults to note.'),
			text: z.string().describe('New body text.'),
			duration: z.enum(['permanent', '1h', '1d', '1w']).optional().describe('New auto-expiry: permanent (default), 1h, 1d, or 1w.')
		}
	},
	async ({ id, title, category, text, duration }) => {
		return textResult(await callApi('POST', '/mcp/updateTask', { body: { id, title, category, text, duration } }));
	}
);

server.registerTool(
	'delete_task',
	{
		title: 'Delete task',
		description: 'Delete a task or Brain entry you own. Requires a write-scoped API key. Not a hard delete — same soft-cease as delete_cheat. Fails with a 403 if you don\'t own it.',
		inputSchema: {
			id: z.string().describe('Id of the item to delete.')
		}
	},
	async ({ id }) => {
		return textResult(await callApi('POST', '/mcp/deleteTask', { body: { id } }));
	}
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error) => {
	console.error('Fatal error running cheatsheet MCP server:', error);
	process.exit(1);
});
