#!/usr/bin/env node
// Local stdio MCP proxy bundled into the plugin, in front of the hosted /mcp Streamable HTTP
// connector (see functions/routes/db/mcpConnector.js in the cheatsheet repo). Same script as
// ../live-proxy.js, kept as its own copy since Claude Code installs a plugin's own directory in
// isolation rather than the whole repo it came from — keep the two in sync if either changes.
//
// Why a file instead of a shell environment variable: a persistent env var is readable by every
// process running under this OS user account, not just Claude Code, and is the kind of thing that
// ends up pasted into a bug report or crash dump by accident. This script reads the key from a
// gitignored .env.local file instead, so it only ever lives in one place read by one script.
//
// It's a pass-through proxy, not a second implementation: tools/list and tools/call are forwarded
// verbatim to the live connector, so this can't drift from whatever the cheatsheet repo's
// functions/routes/db/mcpConnector.js actually exposes.

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
	console.error(`CHEATSHEET_API_KEY is not set — create ${envFilePath} with a line like CHEATSHEET_API_KEY=csk_live_... (get a key from https://cheats.aarontrotter.com/user, API Access section), then restart Claude Code.`);
	process.exit(1);
}

async function main() {
	const remoteClient = new Client({ name: 'cheatsheet-plugin', version: '1.0.0' });
	const remoteTransport = new StreamableHTTPClientTransport(new URL(LIVE_MCP_URL), {
		// X-Cheatsheet-Client lets the server's usage analytics attribute this traffic to the
		// plugin specifically, distinct from a hand-rolled live-proxy.js or local-mcp-server.
		requestInit: { headers: { Authorization: `Bearer ${API_KEY}`, 'X-Cheatsheet-Client': 'cheatsheet-plugin' } }
	});
	await remoteClient.connect(remoteTransport);

	const localServer = new Server({ name: 'cheatsheet', version: '1.0.0' }, { capabilities: { tools: {} } });
	localServer.setRequestHandler(ListToolsRequestSchema, () => remoteClient.listTools());
	localServer.setRequestHandler(CallToolRequestSchema, (request) => remoteClient.callTool(request.params));

	const localTransport = new StdioServerTransport();
	await localServer.connect(localTransport);
}

main().catch((error) => {
	console.error('Fatal error running cheatsheet MCP plugin server:', error);
	process.exit(1);
});
