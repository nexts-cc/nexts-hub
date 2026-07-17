#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const version = argument("--version") ?? "1.0.0";
const selection = argument("--selection") ?? "all";
const concurrency = argument("--concurrency") ?? "8";
const repository = argument("--repository") ?? "nexts-cc/nexts-hub";
if (!process.env.GITHUB_TOKEN?.trim()) throw new Error("GITHUB_TOKEN is required for the local MCP release pipeline");

await run("Validate hub", resolve(root, "scripts/validate.mjs"));
await run("Audit MCP dependencies", resolve(root, "scripts/audit-mcp-dependencies.mjs"));
await run("Check all MCP bundles", resolve(root, "scripts/check-mcp-adapters.mjs"));
await run("Build MCP packages", resolve(root, "scripts/build-mcp-adapters.mjs"), "--selection", selection, "--version", version, "--concurrency", concurrency);
await run("Upload MCP releases", resolve(root, "scripts/publish-mcp-releases.mjs"), "--selection", selection, "--version", version, "--repository", repository);
process.stdout.write(`Local MCP release pipeline completed for version ${version}.\n`);

function run(label, script, ...args) {
  process.stdout.write(`\n== ${label} ==\n`);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${label} failed with exit code ${code}`)));
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
