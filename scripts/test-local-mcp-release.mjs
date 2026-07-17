#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
let uploads = 0;
let published = 0;
let tagDeletes = 0;
let draftDeletes = 0;
const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/repos/nexts-cc/nexts-hub/releases?per_page=100&page=1") {
    const uploadUrl = `http://127.0.0.1:${server.address().port}/uploads{?name,label}`;
    return json(response, 200, [
      { id: 1, tag_name: "mcp-gmail-v1.0.0", draft: true, assets: [], created_at: "2026-01-01T00:00:00Z", upload_url: uploadUrl },
      { id: 2, tag_name: "mcp-gmail-v1.0.0", draft: true, assets: [], created_at: "2026-01-02T00:00:00Z", upload_url: uploadUrl }
    ]);
  }
  if (request.method === "DELETE" && request.url === "/repos/nexts-cc/nexts-hub/releases/2") {
    draftDeletes += 1;
    response.writeHead(204);
    return response.end();
  }
  if (request.method === "POST" && request.url?.startsWith("/uploads?name=")) {
    uploads += 1;
    request.resume();
    return json(response, 201, { id: uploads });
  }
  if (request.method === "PATCH" && request.url === "/repos/nexts-cc/nexts-hub/releases/1") {
    published += 1;
    if (published === 1) return json(response, 422, { message: "Validation Failed", errors: [{ resource: "Release", code: "already_exists", field: "tag_name" }] });
    return json(response, 200, { id: 1, draft: false });
  }
  if (request.method === "DELETE" && request.url === "/repos/nexts-cc/nexts-hub/git/refs/tags/mcp-gmail-v1.0.0") {
    tagDeletes += 1;
    response.writeHead(204);
    return response.end();
  }
  return json(response, 404, { message: "not found" });
});

await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
try {
  await run(resolve(root, "scripts/build-mcp-adapter.mjs"), "--service", "gmail", "--version", "1.0.0");
  await run(resolve(root, "scripts/publish-mcp-releases.mjs"), "--selection", "gmail", "--version", "1.0.0");
  if (uploads !== 2 || published !== 2 || tagDeletes !== 1 || draftDeletes !== 1) {
    throw new Error(`Unexpected recovery counts: ${uploads} assets, ${tagDeletes} tag deletions, ${draftDeletes} duplicate draft deletions, and ${published} publication attempts`);
  }
  process.stdout.write("Local MCP release upload test passed.\n");
} finally {
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

function run(script, ...args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GITHUB_TOKEN: "test-token", GITHUB_API_URL: `http://127.0.0.1:${server.address().port}` }
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(stderr || `Child process exited with ${code}`)));
  });
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
