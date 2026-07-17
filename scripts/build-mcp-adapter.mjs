#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const adapters = resolve(root, "mcp/_adapters");
const service = argument("--service");
const version = argument("--version") ?? "1.0.0";
if (!service || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(service)) throw new Error("--service is required");
const definition = JSON.parse(readFileSync(resolve(adapters, `catalog/apps/${service}.json`), "utf8"));
if (definition.service !== service) throw new Error(`Catalog service mismatch for ${service}`);

const outputRoot = resolve(argument("--output-dir") ?? resolve(root, `dist/mcp/${service}`));
const temporary = resolve(root, `.tmp/mcp-${service}`);
const packageRoot = resolve(temporary, "package");
const entry = resolve(temporary, "server.ts");
const bundledEntry = resolve(packageRoot, "dist/server.mjs");
rmSync(temporary, { recursive: true, force: true });
mkdirSync(dirname(bundledEntry), { recursive: true });
writeFileSync(entry, runtimeSource(definition), "utf8");

await build({
  entryPoints: [entry], outfile: bundledEntry, bundle: true, platform: "node", format: "esm", target: "node20",
  legalComments: "eof", absWorkingDir: adapters, logLevel: "warning",
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __nextsCreateRequire } from 'node:module'; const require = __nextsCreateRequire(import.meta.url);" }
});
writeFileSync(resolve(packageRoot, "package.json"), `${JSON.stringify({
  name: service.replaceAll("_", "-"),
  version,
  type: "module",
  bin: { [`mcp-${service.replaceAll("_", "-")}`]: "dist/server.mjs" },
  engines: { node: ">=20" }
}, null, 2)}\n`, "utf8");

mkdirSync(outputRoot, { recursive: true });
const npmArguments = ["pack", packageRoot, "--pack-destination", outputRoot, "--json"];
const npmCli = process.env.npm_execpath ?? resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
const packedOutput = execFileSync(process.execPath, [npmCli, ...npmArguments], { cwd: root, encoding: "utf8" });
const packed = JSON.parse(packedOutput);
const filename = packed[0].filename;
const artifactPath = resolve(outputRoot, filename);
const sha256 = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
const releaseTag = argument("--release-tag") ?? `mcp-${service}-v${version}`;
const artifactUrl = `https://github.com/nexts-cc/nexts-hub/releases/download/${encodeURIComponent(releaseTag)}/${filename}`;
const release = {
  service,
  distributionType: "nexts_hub",
  version,
  sha256,
  artifactPath,
  artifactUrl,
  runtime: { transport: "stdio", command: "npx", args: ["-y", artifactUrl], url: null, env: {}, headers: {} },
  configurationFields: configurationFields(definition)
};
writeFileSync(resolve(outputRoot, "catalog-release.json"), `${JSON.stringify(release, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(release, null, 2)}\n`);

function runtimeSource(app) {
  const executorPath = resolve(adapters, `src/providers/${app.service}/executors.ts`).replaceAll("\\", "/");
  const metadata = app.actions.map((action) => ({ name: action.name, description: action.description, inputSchema: action.inputSchema, outputSchema: action.outputSchema }));
  const customFields = app.auth.filter((auth) => auth.type === "custom_credential").flatMap((auth) => auth.fields ?? []).map((field) => field.key);
  return `import { executors } from ${JSON.stringify(executorPath)};
const service = ${JSON.stringify(app.service)};
const metadata = ${JSON.stringify(metadata)};
const customFields = ${JSON.stringify(customFields)};
let oauthAccessToken = process.env.NEXTS_ACCESS_TOKEN || '';
let oauthRefreshToken = process.env.NEXTS_REFRESH_TOKEN || '';
let oauthExpiresAt = process.env.NEXTS_ACCESS_TOKEN_EXPIRES_AT ? Date.parse(process.env.NEXTS_ACCESS_TOKEN_EXPIRES_AT) : 0;
function credential() {
  if (oauthAccessToken) return { authType: 'oauth2', accessToken: oauthAccessToken, refreshToken: oauthRefreshToken || undefined, tokenType: 'Bearer', profile: { accountId: 'local', displayName: 'Local account', grantedScopes: [] }, metadata: {} };
  if (process.env.NEXTS_API_KEY) return { authType: 'api_key', apiKey: process.env.NEXTS_API_KEY, values: { apiKey: process.env.NEXTS_API_KEY }, profile: { accountId: 'local', displayName: 'Local account', grantedScopes: [] }, metadata: {} };
  const values = Object.fromEntries(customFields.map((key) => [key, process.env['NEXTS_CREDENTIAL_' + key.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()]]).filter((entry) => entry[1]));
  return Object.keys(values).length ? { authType: 'custom_credential', values, profile: { accountId: 'local', displayName: 'Local account', grantedScopes: [] }, metadata: {} } : { authType: 'no_auth' };
}
async function refreshOAuth(force) {
  if (!oauthRefreshToken || !process.env.NEXTS_ACCOUNT_BASE_URL || !process.env.NEXTS_ACCOUNT_ACCESS_TOKEN || !process.env.NEXTS_OAUTH_SERVICE) return false;
  if (!force && (!oauthExpiresAt || oauthExpiresAt - Date.now() > 60000)) return false;
  const base = process.env.NEXTS_ACCOUNT_BASE_URL.replace(/\\\/+$/, '');
  const parsed = new URL(base);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'))) throw new Error('Unsafe account service URL for OAuth refresh');
  const response = await fetch(base + '/connected-apps/oauth/refresh', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.NEXTS_ACCOUNT_ACCESS_TOKEN }, body: JSON.stringify({ service: process.env.NEXTS_OAUTH_SERVICE, refreshToken: oauthRefreshToken }), redirect: 'error' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.accessToken) throw new Error(body?.error?.message || 'OAuth token refresh failed');
  oauthAccessToken = body.accessToken; oauthRefreshToken = body.refreshToken || oauthRefreshToken; oauthExpiresAt = body.expiresAt ? Date.parse(body.expiresAt) : 0; return true;
}
function send(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }
function authFailure(result) { return JSON.stringify(result?.error ?? result).toLowerCase().match(/401|unauthorized|invalid_token|token_expired/); }
async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || !message.method || message.method.startsWith('notifications/')) return;
  if (message.method === 'initialize') return send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'nexts-' + service, version: ${JSON.stringify(version)} } } });
  if (message.method === 'ping') return send({ jsonrpc: '2.0', id: message.id, result: {} });
  if (message.method === 'tools/list') return send({ jsonrpc: '2.0', id: message.id, result: { tools: metadata.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema || { type: 'object', properties: {} } })) } });
  if (message.method === 'tools/call') {
    const executor = executors[service + '.' + message.params?.name];
    if (typeof executor !== 'function') return send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unknown connector tool' } });
    try {
      await refreshOAuth(false);
      let result = await executor(message.params?.arguments || {}, { getCredential: async (requested) => requested === service ? credential() : undefined });
      if (!result.ok && oauthRefreshToken && authFailure(result) && await refreshOAuth(true)) result = await executor(message.params?.arguments || {}, { getCredential: async (requested) => requested === service ? credential() : undefined });
      if (!result.ok) throw new Error((result.error?.code ? result.error.code + ': ' : '') + (result.error?.message || 'Connector action failed'));
      return send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(result.output) }], structuredContent: result.output } });
    } catch (error) { return send({ jsonrpc: '2.0', id: message.id, result: { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] } }); }
  }
  send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } });
}
let buffered = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { buffered += chunk; let newline; while ((newline = buffered.indexOf('\\n')) >= 0) { const line = buffered.slice(0, newline).trim(); buffered = buffered.slice(newline + 1); if (line) { try { void handle(JSON.parse(line)); } catch (error) { process.stderr.write(String(error) + '\\n'); } } } });
`;
}

function configurationFields(app) {
  const fields = [];
  for (const auth of app.auth) {
    if (auth.type === "api_key") fields.push({ key: "apiKey", label: auth.label ?? "API key", target: "env", targetKey: "NEXTS_API_KEY", required: true, secret: true, placeholder: auth.placeholder ?? null, description: auth.description ?? null });
    if (auth.type === "custom_credential") for (const field of auth.fields ?? []) fields.push({ key: field.key, label: field.label, target: "env", targetKey: `NEXTS_CREDENTIAL_${field.key.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`, required: Boolean(field.required), secret: Boolean(field.secret), placeholder: field.placeholder ?? null, description: field.description ?? null });
  }
  return [...new Map(fields.map((field) => [field.key, field])).values()];
}

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
