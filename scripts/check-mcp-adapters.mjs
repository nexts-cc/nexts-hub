#!/usr/bin/env node

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const adapters = resolve(root, "mcp/_adapters");
const providers = resolve(adapters, "src/providers");
const services = readdirSync(resolve(adapters, "catalog/apps"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -5))
  .sort();
const failures = [];
const concurrency = Math.max(1, Math.min(Number(process.env.MCP_CHECK_CONCURRENCY ?? 8), 16));
let cursor = 0;

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < services.length) {
    const service = services[cursor++];
    const executorPath = resolve(providers, service, "executors.ts").replaceAll("\\", "/");
    try {
      await build({
        stdin: {
          contents: `import { executors } from ${JSON.stringify(executorPath)}; export default executors;`,
          resolveDir: adapters,
          sourcefile: `${service}-check.ts`,
          loader: "ts"
        },
        bundle: true,
        write: false,
        platform: "node",
        format: "esm",
        target: "node20",
        logLevel: "silent"
      });
    } catch (error) {
      failures.push({ service, message: error instanceof Error ? error.message : String(error) });
    }
  }
}));

if (failures.length) {
  process.stderr.write(`MCP adapter bundle check failed for ${failures.length}/${services.length} services:\n`);
  for (const failure of failures) process.stderr.write(`\n[${failure.service}]\n${failure.message}\n`);
  process.exit(1);
}
process.stdout.write(`MCP adapter bundle check passed (${services.length} services).\n`);
