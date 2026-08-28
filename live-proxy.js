#!/usr/bin/env node
// Local stdio MCP proxy in front of the hosted /mcp Streamable HTTP connector (see
// functions/routes/db/mcpConnector.js in the cheatsheet repo).
//
// Why this exists: Claude Code's native "type": "http" .mcp.json entries can only fill a header
// value from a real environment variable already set before Claude Code starts (${VAR}
// expansion) — there's no built-in way for an http-type entry to read an API key out of a
// gitignored .env.local file itself. This script does the exact same .env.local loading
// local-mcp-server/index.js already does, then transparently forwards every request to the live
// server over MCP itself (not a REST re-implementation), so the key only ever has to live in a
// file, never in .mcp.json or a shell environment variable.
//
// It's a pass-through proxy, not a second implementation: tools/list and tools/call are forwarded
// verbatim to the live connector, so this can't drift from whatever the cheatsheet repo's
// functions/routes/db/mcpConnector.js actually exposes — unlike local-mcp-server/index.js (which
// re-implements each tool against the REST /mcp/* API), there's no tool list to keep in sync here.

const fs = require('fs');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

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

const LIVE_MCP_URL = envLocal.CHEATSHEET_LIVE_MCP_URL || process.env.CHEATSHEET_LIVE_MCP_URL || 'https://cheats.aarontrotter.com/mcp';
const API_KEY = envLocal.CHEATSHEET_API_KEY || process.env.CHEATSHEET_API_KEY;

if (!API_KEY) {
	console.error(`CHEATSHEET_API_KEY is not set — add it to ${envFilePath} (see local-mcp-server/README.md for setup).`);
	process.exit(1);
}

async function main() {
	const remoteClient = new Client({ name: 'cheatsheet-live-proxy', version: '1.0.0' });
	const remoteTransport = new StreamableHTTPClientTransport(new URL(LIVE_MCP_URL), {
		// X-Cheatsheet-Client lets the server's usage analytics attribute this traffic to
		// live-proxy specifically, instead of the generic fallback it uses for a directly-added
		// "type": "http" entry with no proxy in front — see mcpConnector.js in the cheatsheet repo.
		requestInit: { headers: { Authorization: `Bearer ${API_KEY}`, 'X-Cheatsheet-Client': 'live-proxy' } }
	});
	await remoteClient.connect(remoteTransport);

	const localServer = new Server({ name: 'cheatsheet', version: '1.0.0' }, { capabilities: { tools: {} } });
	localServer.setRequestHandler(ListToolsRequestSchema, () => remoteClient.listTools());
	localServer.setRequestHandler(CallToolRequestSchema, (request) => remoteClient.callTool(request.params));

	const localTransport = new StdioServerTransport();
	await localServer.connect(localTransport);
}

main().catch((error) => {
	console.error('Fatal error running cheatsheet live MCP proxy:', error);
	process.exit(1);
});
