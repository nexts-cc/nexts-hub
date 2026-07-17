#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { builtinModules } from "node:module";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "mcp/_adapters/src");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const declared = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {})
]);
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const imports = new Map();

for (const file of walk(sourceRoot)) {
  if (!/[.](?:[cm]?ts|[cm]?js)$/.test(file) || /[.]test(?:-helpers)?[.]/.test(file)) continue;
  const source = readFileSync(file, "utf8");
  const patterns = [
    /\bfrom[\t ]+["']([^"'\r\n]+)["']/g,
    /\bimport[\t ]+["']([^"'\r\n]+)["']/g,
    /\bimport[\t ]*\([\t ]*["']([^"'\r\n]+)["'][\t ]*\)/g,
    /\brequire[\t ]*\([\t ]*["']([^"'\r\n]+)["'][\t ]*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.includes(":")) continue;
      const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
      if (builtins.has(packageName)) continue;
      const files = imports.get(packageName) ?? new Set();
      files.add(relative(root, file).replaceAll("\\", "/"));
      imports.set(packageName, files);
    }
  }
}

const missing = [...imports].filter(([name]) => !declared.has(name));
for (const [name, files] of [...imports].sort(([left], [right]) => left.localeCompare(right))) {
  process.stdout.write(`${declared.has(name) ? "ok" : "missing"}\t${name}\t${[...files].join(", ")}\n`);
}
if (missing.length) {
  process.stderr.write(`MCP adapter dependencies missing from package.json: ${missing.map(([name]) => name).join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`MCP adapter dependency audit passed (${imports.size} external packages).\n`);
}

function walk(directory) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (extname(entry.name)) files.push(path);
  }
  return files;
}
