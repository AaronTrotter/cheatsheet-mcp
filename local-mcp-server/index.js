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

// Tasks tools, mirroring the hosted connector's (functions/routes/db/mcpConnector.js in the
// cheatsheet repo) so both surfaces expose the same set. Tasks and Brain have a Firestore
// collection each (`tasks`, `brain`) behind one shared route file server-side, but they have
// diverged into separate sections and this surface treats them that way: the tools below cover
// Tasks only, the brain tools further down cover Brain only, and neither can reach the other's
// items. An id from the wrong section comes back as a 404 rather than quietly working.
const TASKS_CATEGORIES = ['note', 'list'];

server.registerTool(
	'search_tasks',
	{
		title: 'Search tasks',
		description: 'Search the user\'s private Tasks: their own notes and to-do lists, kept separate from cheats. Returns id, title, category, text, expiresAtMs (null if permanent), checkedLines and createdDateMs for each match, plus totalPages for pagination. This covers Tasks only. The user\'s Brain (the context, rules and memories written for you) is a separate section, reached with search_brain, and nothing here will find it.',
		inputSchema: {
			query: z.string().optional().describe('Search text matched against title/text/category; omit to list the most recently created tasks.'),
			category: z.enum(TASKS_CATEGORIES).optional().describe('Restrict to one category: \'note\' for a plain note, \'list\' for a checklist. Omit to search both.'),
			page: z.number().int().min(1).optional().describe('1-indexed page number (default 1).')
		}
	},
	async ({ query, category, page }) => {
		return textResult(await callApi('GET', '/mcp/searchTasks', { query: { q: query, category, page } }));
	}
);

server.registerTool(
	'get_task',
	{
		title: 'Get task',
		description: 'Fetch one task by id (as returned by search_tasks). Fails with a 404 if the id belongs to a Brain entry rather than a task; use get_brain for those.',
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
		description: 'Create a new Task for the user: something they want to do or remember. Requires a write-scoped API key. Always private, never appears in cheat search. To record something for yourself instead, use add_brain, which writes to the Brain section this tool cannot reach.',
		inputSchema: {
			title: z.string().max(40).describe('Title (max 40 chars).'),
			category: z.enum(TASKS_CATEGORIES).optional().describe('\'note\' (default) is a plain note, \'list\' is a checklist whose lines the user can tick off.'),
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
		description: 'Revise a task you own. Requires a write-scoped API key. Append-only under the hood like update_cheat, but Tasks have no visible revision history, so this returns the one current task. Fails with a 404 if the id belongs to a Brain entry; use update_brain for those.',
		inputSchema: {
			id: z.string().describe('Id of the task to revise.'),
			title: z.string().max(40).describe('New title (max 40 chars).'),
			category: z.enum(TASKS_CATEGORIES).optional().describe('New category: \'note\' or \'list\'. Omit to keep the task as it is.'),
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
		description: 'Delete a task you own. Requires a write-scoped API key. Not a hard delete, the same soft-cease as delete_cheat. Fails with a 403 if you don\'t own it, and a 404 if the id belongs to a Brain entry; use delete_brain for those.',
		inputSchema: {
			id: z.string().describe('Id of the task to delete.')
		}
	},
	async ({ id }) => {
		return textResult(await callApi('POST', '/mcp/deleteTask', { body: { id } }));
	}
);

// Brain tools: the same five task operations again, scoped to the three AI-facing categories.
// Brain is a separate section from Tasks, not a filtered view of it: the task tools above cannot
// reach anything here, and these cannot reach anything there. The server refuses an id from the
// wrong section either way, so deleting a 'memory' can never quietly cease somebody's shopping
// list.
const BRAIN_CATEGORIES = ['brief', 'rules', 'memory'];

server.registerTool(
	'search_brain',
	{
		title: 'Search brain',
		description: 'Search the user\'s Brain: \'brief\' entries are orienting context they wrote for you, \'rules\' are hard constraints they expect you to follow, and \'memory\' is what you have recorded for yourself in past sessions. Search this before assuming you know how the user works, and before recording something you may already have written down. Returns id, title, category, text, expiresAtMs (null if permanent) and createdDateMs per entry, plus totalPages. Tasks (the user\'s own notes and to-do lists) are a separate section, reached with search_tasks.',
		inputSchema: {
			query: z.string().optional().describe('Search text matched against title/text/category; omit to list the most recently created entries.'),
			category: z.enum(BRAIN_CATEGORIES).optional().describe('Restrict to one category. Omit to search all three.'),
			page: z.number().int().min(1).optional().describe('1-indexed page number (default 1).')
		}
	},
	async ({ query, category, page }) => {
		return textResult(await callApi('GET', '/mcp/searchBrain', { query: { q: query, category, page } }));
	}
);

server.registerTool(
	'get_brain',
	{
		title: 'Get brain entry',
		description: 'Fetch one Brain entry by id (as returned by search_brain). Fails with a 404 if the id belongs to a task rather than a Brain entry.',
		inputSchema: {
			id: z.string().describe('The Brain entry id.')
		}
	},
	async ({ id }) => {
		return textResult(await callApi('GET', '/mcp/getBrain', { query: { id } }));
	}
);

server.registerTool(
	'add_brain',
	{
		title: 'Add brain entry',
		description: 'Record something in the user\'s Brain. Requires a write-scoped API key. Use this to save what you have worked out and want to remember next session, which is what the default \'memory\' category is for. \'brief\' and \'rules\' are the user\'s own guidance to you, so write those two only when the user has actually asked you to. Search first: an entry that repeats one already there is worse than no entry.',
		inputSchema: {
			title: z.string().max(40).describe('Short title (max 40 chars).'),
			category: z.enum(BRAIN_CATEGORIES).optional().describe('\'memory\' (default) is what you record for yourself, \'brief\' is orienting context, \'rules\' are hard constraints. Defaults to memory.'),
			text: z.string().describe('The entry body text.'),
			duration: z.enum(['permanent', '1h', '1d', '1w']).optional().describe('Auto-expiry: permanent (default), 1h, 1d, or 1w. An expired entry is automatically deleted (soft-ceased). Use a duration for something only true for now.')
		}
	},
	async ({ title, category, text, duration }) => {
		return textResult(await callApi('POST', '/mcp/addBrain', { body: { title, category, text, duration } }));
	}
);

server.registerTool(
	'update_brain',
	{
		title: 'Update brain entry',
		description: 'Revise a Brain entry. Requires a write-scoped API key. Append-only under the hood like update_cheat, but Brain has no visible revision history, so this returns the one current entry. Prefer revising an entry that has gone out of date over adding a second one next to it. Editing a \'brief\' or \'rules\' entry rewrites the user\'s own guidance, so leave those alone unless asked.',
		inputSchema: {
			id: z.string().describe('Id of the entry to revise.'),
			title: z.string().max(40).describe('New title (max 40 chars).'),
			category: z.enum(BRAIN_CATEGORIES).optional().describe('New category. Omit to keep the entry where it is.'),
			text: z.string().describe('New body text.'),
			duration: z.enum(['permanent', '1h', '1d', '1w']).optional().describe('New auto-expiry: permanent (default), 1h, 1d, or 1w.')
		}
	},
	async ({ id, title, category, text, duration }) => {
		return textResult(await callApi('POST', '/mcp/updateBrain', { body: { id, title, category, text, duration } }));
	}
);

server.registerTool(
	'delete_brain',
	{
		title: 'Delete brain entry',
		description: 'Delete a Brain entry. Requires a write-scoped API key. Not a hard delete, the same soft-cease as delete_cheat. Deleting a \'brief\' or \'rules\' entry throws away guidance the user wrote for you, so only do that when they have asked for that specific entry to go.',
		inputSchema: {
			id: z.string().describe('Id of the entry to delete.')
		}
	},
	async ({ id }) => {
		return textResult(await callApi('POST', '/mcp/deleteBrain', { body: { id } }));
	}
);

// Pennies: the user's own investment order log. Mirrors the same five tools the hosted connector
// exposes (functions/routes/db/mcpConnector.js in the cheatsheet repo) — the two surfaces are
// meant to be interchangeable, so a tool added to one belongs in the other in the same change.
const PENNY_SIDES = ['buy', 'sell', 'stake', 'unstake', 'reward'];
const PENNY_ITEM_TYPES = ['crypto', 'stock', 'etf', 'bond', 'commodity', 'cfd', 'other'];
const PENNY_ORDER_KINDS = ['market', 'limit'];

server.registerTool(
	'search_pennies',
	{
		title: 'Search pennies',
		description: 'List the user\'s own logged investment orders (crypto, stocks, ETFs, bonds, commodities, CFDs), newest first. Returns each order\'s id, side, itemType, assetName, platform, currency, quantity, pricePerUnit, fees, tax, date, status and walletId, plus totalPages for pagination and the type/asset values available to filter on. This is the raw order log; call get_penny_summary for positions and profit.',
		inputSchema: {
			itemType: z.enum(PENNY_ITEM_TYPES).optional().describe('Restrict to one instrument type.'),
			assetName: z.string().optional().describe('Restrict to one asset, e.g. \'BTC\'. Applied within itemType when both are given.'),
			page: z.number().int().min(1).optional().describe('1-indexed page number (default 1).')
		}
	},
	async ({ itemType, assetName, page }) => {
		return textResult(await callApi('GET', '/mcp/searchPennies', { query: { itemType, assetName, page } }));
	}
);

server.registerTool(
	'get_penny_summary',
	{
		title: 'Get penny summary',
		description: 'The user\'s portfolio: one holding per asset with quantity held, staked quantity, average cost, cost basis, realized profit or loss, fees paid and (for crypto with a known symbol) a live price and unrealized profit or loss. Each holding carries a ledger of the orders behind it. Cost basis uses the moving-average method. If the user has set a base currency, every figure also comes back converted into it, historical costs at the rate on their own trade date. A holding whose remainingQty is negative means orders are missing from the log, so its cost figures understate the true cost. The reconciliation array pairs the logged quantity of each asset against a balance the user recorded by hand and gives the drift between them, which is the surer way to spot a trade that was never entered; it is null when a taxYear is applied.',
		inputSchema: {
			taxYear: z.number().int().optional().describe('Restrict to one tax year, named by the calendar year it starts in. Boundaries follow the user\'s country, so a UK tax year runs 6 April to 5 April. Holdings come back as at that year end; realized profit, staking income and fees cover only that year. Omit for all time. The response lists the years with activity in taxYears.')
		}
	},
	async ({ taxYear }) => {
		return textResult(await callApi('GET', '/mcp/getPennySummary', { query: { taxYear } }));
	}
);

server.registerTool(
	'add_penny',
	{
		title: 'Add penny order',
		description: 'Log an investment order. Requires a write-scoped API key. This is a financial record the user keeps for themselves, so log only what the user has actually told you happened, and never guess a price, quantity or date.',
		inputSchema: {
			side: z.enum(PENNY_SIDES).describe('buy or sell for a trade. stake, unstake and reward are crypto only: stake and unstake move units in and out of staking without changing cost basis, and reward records staking interest paid out.'),
			itemType: z.enum(PENNY_ITEM_TYPES).describe('The kind of instrument.'),
			assetName: z.string().max(20).describe('Ticker or short name, e.g. \'BTC\' or \'AAPL\' (max 20 chars).'),
			currency: z.string().describe('ISO 4217 currency code the order settled in, e.g. \'GBP\'.'),
			quantity: z.number().positive().describe('Units bought, sold, staked, unstaked, or received as a reward.'),
			pricePerUnit: z.number().optional().describe('Price per unit in `currency`. Required for buy and sell. Omitted or 0 for stake and unstake. On a reward it is the optional unit value at receipt, reported as staking income and never treated as cost.'),
			orderKind: z.enum(PENNY_ORDER_KINDS).optional().describe('\'market\' (default) for a trade that already happened. \'limit\' for one placed but not yet executed, which stays out of the summary until confirmed with fill_penny.'),
			rewardQuantity: z.number().optional().describe('Unstake only: extra units the staking product paid out alongside the unstaked amount.'),
			platform: z.string().max(30).optional().describe('Where it was traded, e.g. \'Revolut\'.'),
			walletId: z.string().max(100).optional().describe('Crypto only: the wallet address involved. Dropped for other instrument types.'),
			fees: z.number().optional().describe('Total fees paid on this order (default 0).'),
			tax: z.number().optional().describe('Total tax paid or withheld on this order (default 0).'),
			date: z.number().optional().describe('Trade date as a millisecond timestamp. Defaults to now; backdate it to the real trade date, which is what the currency conversion uses.'),
			notes: z.string().max(200).optional().describe('Optional note (max 200 chars).')
		}
	},
	async (args) => {
		return textResult(await callApi('POST', '/mcp/addPenny', { body: { ...args, date: args.date ?? Date.now() } }));
	}
);

server.registerTool(
	'fill_penny',
	{
		title: 'Fill penny order',
		description: 'Confirm that a pending limit order actually executed, which is what lets it count toward the portfolio. Requires a write-scoped API key. Anything omitted keeps what was originally logged, so pass only what differed from the order as placed.',
		inputSchema: {
			id: z.string().describe('The pending order\'s id.'),
			pricePerUnit: z.number().optional().describe('The actual fill price, if it differed from the target.'),
			fees: z.number().optional().describe('Actual fees, if they differed.'),
			tax: z.number().optional().describe('Actual tax, if it differed.'),
			date: z.number().optional().describe('Actual execution date as a millisecond timestamp, if it differed from when the order was placed.')
		}
	},
	async ({ id, pricePerUnit, fees, tax, date }) => {
		return textResult(await callApi('POST', '/mcp/fillPenny', { body: { id, pricePerUnit, fees, tax, date } }));
	}
);

server.registerTool(
	'void_penny',
	{
		title: 'Void penny order',
		description: 'Void (delete) a logged order, or cancel one still pending. Requires a write-scoped API key. This is how an order is removed: it is a soft delete, and it cannot be undone from here. Voiding changes the user\'s recorded financial history, so only do it when they have asked for that specific order to go.',
		inputSchema: {
			id: z.string().describe('The order\'s id.')
		}
	},
	async ({ id }) => {
		return textResult(await callApi('POST', '/mcp/voidPenny', { body: { id } }));
	}
);

// Projects: the user's Kanban board. Two collections behind it, so two sets of tools — the
// projects themselves, then the cards on them. Renaming a project, sharing a card and deleting a
// whole project are deliberately not exposed on either surface; see the hosted connector for why.
const PROJECT_TASK_STATUSES = ['open', 'in-progress', 'in-review'];

server.registerTool(
	'search_projects',
	{
		title: 'Search projects',
		description: 'List the user\'s projects, which are the boards their cards are grouped onto. Returns id, name, createdDateMs, memberCount and role for each. role is \'owner\' for the user\'s own boards, or \'editor\'/\'viewer\' for a board somebody else shared with them: a \'viewer\' board is read-only, so the write tools below will refuse it. Call this first when you need a projectId for any of the card tools below.',
		inputSchema: {}
	},
	async () => {
		return textResult(await callApi('GET', '/mcp/searchProjects'));
	}
);

server.registerTool(
	'add_project',
	{
		title: 'Add project',
		description: 'Create a new project (a board to put cards on). Requires a write-scoped API key. Check search_projects first: a project is a long-lived grouping, so a near-duplicate of one that already exists splits the user\'s board in two.',
		inputSchema: {
			name: z.string().max(30).describe('Project name (max 30 chars).')
		}
	},
	async ({ name }) => {
		return textResult(await callApi('POST', '/mcp/addProject', { body: { name } }));
	}
);

server.registerTool(
	'search_project_tasks',
	{
		title: 'Search project cards',
		description: 'List the cards on the user\'s board, across their own projects and any shared with them. Returns id, title, projectID, status, text, highlights, links and createdDateMs for each. status is which column the card sits in: \'open\', \'in-progress\' or \'in-review\'. There is no done status — a finished card is deleted and leaves the board. Returns the whole board at once rather than a page of it, so narrow it with projectId or query when you only want part.',
		inputSchema: {
			query: z.string().optional().describe('Search text matched against title/text; omit for every card.'),
			projectId: z.string().optional().describe('Restrict to one project\'s cards (id from search_projects). Omit for every project\'s.')
		}
	},
	async ({ query, projectId }) => {
		return textResult(await callApi('GET', '/mcp/searchProjectTasks', { query: { q: query, projectId } }));
	}
);

server.registerTool(
	'get_project_task',
	{
		title: 'Get project card',
		description: 'Fetch one card by id (as returned by search_project_tasks).',
		inputSchema: {
			id: z.string().describe('The card id.')
		}
	},
	async ({ id }) => {
		return textResult(await callApi('GET', '/mcp/getProjectTask', { query: { id } }));
	}
);

server.registerTool(
	'add_project_task',
	{
		title: 'Add project card',
		description: 'Add a card to one of the user\'s projects. Requires a write-scoped API key, and a project the user owns or has editor access to. The card lands in whichever column you give it, defaulting to \'open\'.',
		inputSchema: {
			title: z.string().max(40).describe('Card title (max 40 chars).'),
			projectId: z.string().describe('Id of the project to add it to, from search_projects.'),
			text: z.string().describe('The card body text.'),
			status: z.enum(PROJECT_TASK_STATUSES).optional().describe('Which column it starts in (default \'open\').')
		}
	},
	async ({ title, projectId, text, status }) => {
		return textResult(await callApi('POST', '/mcp/addProjectTask', { body: { title, projectID: projectId, text, status } }));
	}
);

server.registerTool(
	'update_project_task',
	{
		title: 'Update project card',
		description: 'Revise a card on a board the user can write to, which on a shared board includes cards other people added. Requires a write-scoped API key. Append-only under the hood like update_cheat, so this returns a new id and the old one stops resolving. Only for changing a card\'s content: to move it between columns use move_project_task, which keeps the id.',
		inputSchema: {
			id: z.string().describe('Id of the card to revise.'),
			title: z.string().max(40).describe('New title (max 40 chars).'),
			projectId: z.string().describe('Id of the project the card belongs to. Pass a different one to move the card to another board.'),
			text: z.string().describe('New card body text.'),
			status: z.enum(PROJECT_TASK_STATUSES).optional().describe('New column. Omit to leave the card where it is.')
		}
	},
	async ({ id, title, projectId, text, status }) => {
		return textResult(await callApi('POST', '/mcp/updateProjectTask', { body: { id, title, projectID: projectId, text, status } }));
	}
);

server.registerTool(
	'move_project_task',
	{
		title: 'Move project card',
		description: 'Move a card to another column. Requires a write-scoped API key. This is the tool for progress updates: it keeps the card\'s id, where update_project_task would mint a new one. There is no done column, so use delete_project_task when a card is finished.',
		inputSchema: {
			id: z.string().describe('Id of the card to move.'),
			status: z.enum(PROJECT_TASK_STATUSES).describe('The column to move it to.')
		}
	},
	async ({ id, status }) => {
		return textResult(await callApi('POST', '/mcp/moveProjectTask', { body: { id, status } }));
	}
);

server.registerTool(
	'delete_project_task',
	{
		title: 'Delete project card',
		description: 'Delete a card on a board the user can write to, which is also how a finished card leaves the board. Requires a write-scoped API key. Not a hard delete, the same soft-cease as delete_cheat, but the card does disappear from the board for everybody on it, so only do it when the user has said that card is done or unwanted.',
		inputSchema: {
			id: z.string().describe('Id of the card to delete.')
		}
	},
	async ({ id }) => {
		return textResult(await callApi('POST', '/mcp/deleteProjectTask', { body: { id } }));
	}
);

// Dues: money other people owe the user. Mirrors the same nine tools the hosted connector exposes
// (functions/routes/db/mcpConnector.js in the cheatsheet repo) — the two surfaces are meant to be
// interchangeable, so a tool added to one belongs in the other in the same change.
//
// Freezing a payer, sending a payment reminder and editing a due are deliberately not exposed on
// either surface. The first two act on a real client rather than on the user's own records, and
// editing a raised-but-unpaid due is what reprices every future one; see the hosted connector.

const DUE_CYCLES = ['monthly', 'quarterly', 'yearly', 'none'];
const DUE_SCHEDULES = ['fixed', 'onPayment'];

server.registerTool(
	'search_due_payers',
	{
		title: 'Search due payers',
		description: "List the people and companies who owe the user money, sorted by company then name. Returns each payer's id, name, company, email, currency, notes, whether they are frozen and why, and whether they are archived. Call this to turn a name into an id, or to check somebody is not already on the list before adding them again.",
		inputSchema: {
			q: z.string().optional().describe('Substring match over name and company, case-insensitive. Omit for everybody.'),
			includeArchived: z.boolean().optional().describe('Include archived payers, who are filed away but still owed money. Default false.')
		}
	},
	async ({ q, includeArchived }) => {
		return textResult(await callApi('GET', '/mcp/searchDuePayers', { query: { q, includeArchived: includeArchived ? '1' : undefined } }));
	}
);

server.registerTool(
	'search_due_services',
	{
		title: 'Search due services',
		description: "List the recurring things the user bills their payers for, soonest next date first. Returns each service's id, payer, label, price and VAT rate, cycle, schedule, the next date it will bill on, how many charges it currently has unpaid and the oldest of those, plus frozen and archived state. Check here before adding a service, so an existing one is not duplicated. A service whose schedule is 'onPayment' will not bill again until its open charge is paid, whatever its next date says.",
		inputSchema: {
			payerId: z.string().optional().describe('Restrict to one payer, by id.'),
			q: z.string().optional().describe('Substring match over the service label, case-insensitive.'),
			includeArchived: z.boolean().optional().describe('Include archived services. Default false.')
		}
	},
	async ({ payerId, q, includeArchived }) => {
		return textResult(await callApi('GET', '/mcp/searchDueServices', { query: { payerId, q, includeArchived: includeArchived ? '1' : undefined } }));
	}
);

server.registerTool(
	'add_due_payer',
	{
		title: 'Add due payer',
		description: "Add a person or company who owes the user money. Requires a write-scoped API key. This records a REAL third party's name and email address, so add only somebody the user has actually named, and never invent contact details. Check search_due_payers first: nothing stops two payers having the same name, and money recorded against the wrong one is worse than money not recorded. The email is what a payment reminder would be sent to, and reminders are only ever sent by the user pressing a button, never by a tool.",
		inputSchema: {
			name: z.string().max(60).describe("Who owes the money, e.g. 'Bob Smith' (max 60 chars)."),
			company: z.string().max(60).optional().describe('Their company, if the work is billed through one (max 60 chars). Also used to group the list.'),
			email: z.string().max(120).optional().describe('Where a payment reminder would go. Leave it out if the user has not given you one: a payer without an email simply cannot be sent a reminder.'),
			paymentMethod: z.string().max(40).optional().describe("How the user wants THIS payer to pay them, as a label: 'PayPal', 'Monzo', 'Revolut', 'Bank transfer'. These are the user's OWN payment details, not the payer's, and they are quoted back in that payer's reminder email."),
			paymentHandle: z.string().max(120).optional().describe("Where the money actually goes: the user's own PayPal address, Monzo or Revolut handle, or account reference. Recorded verbatim, so an @ or an underscore survives. Never invent one."),
			currency: z.string().optional().describe("ISO 4217 code their charges default to, e.g. 'GBP'. Defaults to the user's own base currency when omitted."),
			notes: z.string().max(200).optional().describe("A note for the user's own reference, never emailed (max 200 chars).")
		}
	},
	async (args) => {
		return textResult(await callApi('POST', '/mcp/addDuePayer', { body: args }));
	}
);

server.registerTool(
	'add_due_service',
	{
		title: 'Add due service',
		description: 'Set up a recurring thing a payer is billed for: their hosting, one domain, one parking bay. Requires a write-scoped API key. This is the tool that makes charges appear by itself later, so set it up only from what the user has actually told you, and never guess a price or a start date. IMPORTANT: if firstDueDate is in the past, the charges for every period since then are raised immediately, and the response says how many as `raised` — so a monthly service back-dated a year creates twelve unpaid charges on the spot. That is the intended way to record something already being billed, but say so when you do it.',
		inputSchema: {
			payerName: z.string().optional().describe('Who is billed, by name or company, matched exactly and case-insensitively. Use this or payerId. An ambiguous name is an error rather than a guess.'),
			payerId: z.string().optional().describe('Who is billed, by id. Takes precedence over payerName.'),
			label: z.string().max(60).describe("What it is, e.g. 'Website hosting' or 'example.com domain' (max 60 chars). Becomes the description of the first charge."),
			amount: z.number().nonnegative().describe('What it costs each time, BEFORE VAT. Only ever the seed price: each later charge copies the one before it, so changing the price later means editing an unpaid charge in the browser, not this.'),
			taxRate: z.number().min(0).max(100).optional().describe('VAT percentage on top of `amount`. Omit entirely when there is no VAT: omitted and 0 are different, and only one of them prints a VAT line.'),
			currency: z.string().optional().describe("ISO 4217 code. Defaults to the payer's own currency."),
			cycle: z.enum(DUE_CYCLES).describe("How often it repeats. 'none' is a one-off that never comes round again."),
			schedule: z.enum(DUE_SCHEDULES).optional().describe("'fixed' (default) bills on its date whether or not the last one was paid, so arrears stack up; 'onPayment' raises the next one only once the current one is marked paid, which suits something you stop providing when unpaid. Ignored for a 'none' cycle."),
			firstDueDate: z.number().describe('When the first charge falls due, as a millisecond timestamp, normalized to UTC midnight. Its day of the month becomes the anchor the cycle bills on. A date in the past raises everything owed since then straight away.')
		}
	},
	async (args) => {
		return textResult(await callApi('POST', '/mcp/addDueService', { body: { ...args, nextDueDate: args.firstDueDate } }));
	}
);

server.registerTool(
	'search_dues',
	{
		title: 'Search dues',
		description: "List what people currently owe the user, most pressing first: unpaid before paid, oldest first within each. Returns each due's id, payer, description, net and gross amount, VAT rate, currency, due date, status, and how many days late it is, plus totalPages for pagination and the payers available to filter on. `overdue` is worked out from the date at the moment you ask, so it is always current. Call get_dues_summary for balances rather than adding these up yourself.",
		inputSchema: {
			payerId: z.string().optional().describe('Restrict to one payer, by id. The payer list comes back on every response.'),
			status: z.enum(['unpaid', 'paid', 'overdue']).optional().describe("'unpaid' is everything not yet settled; 'overdue' is the narrower slice of that which is past its due date; 'paid' is settled. Omit for everything."),
			page: z.number().int().min(1).optional().describe('1-indexed page number (default 1).')
		}
	},
	async ({ payerId, status, page }) => {
		return textResult(await callApi('GET', '/mcp/searchDues', { query: { payerId, status, page } }));
	}
);

server.registerTool(
	'get_due',
	{
		title: 'Get due',
		description: "Read one due in full by id, including the payer's name and email, which service raised it, the net/VAT/gross split, when it was paid and for how much, and when a reminder was last sent.",
		inputSchema: {
			id: z.string().describe("The due's id.")
		}
	},
	async ({ id }) => {
		return textResult(await callApi('GET', '/mcp/getDue', { query: { id } }));
	}
);

server.registerTool(
	'get_dues_summary',
	{
		title: 'Get dues summary',
		description: "Balances rather than the raw list: what is outstanding, what is overdue, what falls due in the next 30 days, and what has been paid this year, plus a per-payer breakdown carrying each payer's oldest unpaid date, how many days late it is, and whether they are frozen. Money comes back per currency, and additionally converted into the user's base currency only when every due in that tally could be converted, so a null baseAmount means mixed currencies rather than zero.",
		inputSchema: {
			payerId: z.string().optional().describe('Restrict to one payer, by id. Omit for everybody.')
		}
	},
	async ({ payerId }) => {
		return textResult(await callApi('GET', '/mcp/getDuesSummary', { query: { payerId } }));
	}
);

server.registerTool(
	'add_due',
	{
		title: 'Add due',
		description: 'Record a one-off amount somebody owes the user. Requires a write-scoped API key. This is a financial record the user keeps about a real client, so record only what the user has actually told you, and never guess an amount or a date. Recurring charges are set up as services in the browser and raise themselves; this is for one-offs and for catching up on something missed.',
		inputSchema: {
			payerName: z.string().optional().describe('Who owes it, by name or company, matched exactly and case-insensitively. Use this or payerId. An ambiguous name is an error rather than a guess.'),
			payerId: z.string().optional().describe('Who owes it, by id. Takes precedence over payerName.'),
			description: z.string().max(200).describe("What it is for, e.g. 'Website hosting 2027' (max 200 chars)."),
			amount: z.number().nonnegative().describe('The amount owed BEFORE VAT.'),
			taxRate: z.number().min(0).max(100).optional().describe('VAT percentage on top of `amount`. Omit entirely when there is no VAT: omitted and 0 are different, and only one of them prints a VAT line.'),
			currency: z.string().optional().describe("ISO 4217 currency code, e.g. 'GBP'. Defaults to the payer's own currency."),
			dueDate: z.number().describe('When it falls due, as a millisecond timestamp. Normalized to UTC midnight of that day.')
		}
	},
	async (args) => {
		return textResult(await callApi('POST', '/mcp/addDue', { body: args }));
	}
);

server.registerTool(
	'mark_due_paid',
	{
		title: 'Mark due paid',
		description: "Record that a due has been settled. Requires a write-scoped API key. If it came from a service that recurs only after payment, this ALSO raises the next one straight away, dated one cycle on from this one's own due date and priced at whatever this one was priced at — the response says so as rolledChildID. That makes this more than a status change, so only do it when the user has told you the money actually arrived.",
		inputSchema: {
			id: z.string().describe("The due's id."),
			paidDate: z.number().optional().describe('When it was paid, as a millisecond timestamp. Defaults to today.'),
			paidAmount: z.number().optional().describe('What actually landed, if it differed from the gross amount owed. Defaults to the full gross.')
		}
	},
	async ({ id, paidDate, paidAmount }) => {
		return textResult(await callApi('POST', '/mcp/markDuePaid', { body: { id, paidDate, paidAmount } }));
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
