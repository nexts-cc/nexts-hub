#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogRoot = resolve(root, "mcp/_adapters/catalog/apps");
const selection = argument("--selection")?.trim() || "all";
const batchSize = Number.parseInt(argument("--batch-size") ?? "25", 10);
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
  throw new Error("--batch-size must be an integer between 1 and 100");
}

const available = readdirSync(catalogRoot)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.slice(0, -5))
  .sort();
const availableSet = new Set(available);
const selected = selection.toLowerCase() === "all"
  ? available
  : [...new Set(selection.split(",").map((value) => value.trim()).filter(Boolean))].sort();
if (selected.length === 0) throw new Error("No MCP adapters were selected");

for (const service of selected) {
  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(service) || !availableSet.has(service) ||
      !existsSync(resolve(root, `mcp/_adapters/src/providers/${service}/executors.ts`))) {
    throw new Error(`Unknown or incomplete MCP adapter: ${service}`);
  }
}

const batches = [];
for (let index = 0; index < selected.length; index += batchSize) {
  batches.push({ id: Math.floor(index / batchSize) + 1, services: selected.slice(index, index + batchSize).join(",") });
}
process.stdout.write(JSON.stringify(batches));

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
