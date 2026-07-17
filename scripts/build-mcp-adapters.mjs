#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogRoot = resolve(root, "mcp/_adapters/catalog/apps");
const selection = argument("--selection")?.trim() || "all";
const version = argument("--version") ?? "1.0.0";
const concurrency = integerArgument("--concurrency", 4, 1, 16);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error("--version must be SemVer");

const available = readdirSync(catalogRoot).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).sort();
const availableSet = new Set(available);
const services = selection.toLowerCase() === "all"
  ? available
  : [...new Set(selection.split(",").map((value) => value.trim()).filter(Boolean))].sort();
if (!services.length) throw new Error("No MCP adapters were selected");
for (const service of services) if (!availableSet.has(service)) throw new Error(`Unknown MCP adapter: ${service}`);

let cursor = 0;
let completed = 0;
const failures = [];
mkdirSync(resolve(root, "dist/mcp"), { recursive: true });
await Promise.all(Array.from({ length: Math.min(concurrency, services.length) }, async () => {
  while (cursor < services.length) {
    const service = services[cursor++];
    try {
      await runBuilder(service);
      completed += 1;
      if (completed === services.length || completed % 25 === 0) process.stdout.write(`Built ${completed}/${services.length} MCP adapters.\n`);
    } catch (error) {
      failures.push({ service, message: error instanceof Error ? error.message : String(error) });
    }
  }
}));

if (failures.length) {
  for (const failure of failures) process.stderr.write(`\n[${failure.service}]\n${failure.message}\n`);
  throw new Error(`Local MCP build failed for ${failures.length}/${services.length} adapters`);
}

const releases = services.map((service) => JSON.parse(readFileSync(resolve(root, `dist/mcp/${service}/catalog-release.json`), "utf8")));
const manifestPath = resolve(root, `dist/mcp/releases-${version}.json`);
writeFileSync(manifestPath, `${JSON.stringify({ version, generatedAt: new Date().toISOString(), releases }, null, 2)}\n`, "utf8");
process.stdout.write(`Local MCP build complete: ${services.length} packages.\nManifest: ${manifestPath}\n`);

function runBuilder(service) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(root, "scripts/build-mcp-adapter.mjs"), "--service", service, "--version", version], {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-20000); });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(stderr || `Builder exited with code ${code}`)));
  });
}

function integerArgument(name, fallback, minimum, maximum) {
  const value = Number.parseInt(argument(name) ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return value;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
