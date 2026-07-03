#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const idPattern = /^[a-z][a-z0-9-_]*$/;

function main() {
  const [category, id] = process.argv.slice(2);

  if (!category || !id) {
    fail("Usage: node scripts/new.mjs <category> <id>");
  }
  if (!["skill", "plugin", "assistant", "mcp"].includes(category)) {
    fail(`Unknown category: ${category}`);
  }
  if (!idPattern.test(id)) {
    fail(`Invalid id: ${id}. Use ${idPattern}.`);
  }

  const targetPath = createItem(category, id);
  runSyncIndex();
  console.log(`created ${toSlash(targetPath)}`);
  console.log("Next: edit the generated files, run npm run validate, then bump the category version if needed.");
}

function createItem(category, id) {
  if (category === "skill") {
    return createSkill(id);
  }
  if (category === "plugin") {
    return createPlugin(id);
  }
  if (category === "assistant") {
    return createJsonTemplate("assistants", "basic-assistant", id, "assistant.json");
  }
  return createJsonTemplate("mcp", "basic-mcp", id, "mcp.json");
}

function createSkill(id) {
  const source = join(root, "skills", "templates", "basic-skill");
  const target = join(root, "skills", "skills", id);
  copyTemplate(source, target);

  const skillPath = join(target, "SKILL.md");
  const content = readFileSync(skillPath, "utf8").replace(/^name:\s*.+$/m, `name: ${id}`);
  writeFileSync(skillPath, content, "utf8");
  return target;
}

function createPlugin(id) {
  const source = join(root, "plugins", "templates", "basic-plugin");
  const target = join(root, "plugins", "plugins", id);
  copyTemplate(source, target);

  const manifestPath = join(target, ".nexts-plugin", "plugin.json");
  const manifest = readJson(manifestPath);
  if (Object.hasOwn(manifest, "name")) {
    manifest.name = id;
  }
  if (Object.hasOwn(manifest, "id")) {
    manifest.id = id;
  }
  writeJson(manifestPath, manifest);
  appendMarketplacePlugin(id);
  return target;
}

function createJsonTemplate(category, templateName, id, manifestName) {
  const source = join(root, category, "templates", templateName);
  const target = join(root, category, id);
  copyTemplate(source, target);

  const manifestPath = join(target, manifestName);
  const manifest = readJson(manifestPath);
  manifest.id = id;
  writeJson(manifestPath, manifest);
  return target;
}

function copyTemplate(source, target) {
  if (existsSync(target)) {
    fail(`Target already exists: ${toSlash(target)}`);
  }
  cpSync(source, target, { recursive: true });
}

function appendMarketplacePlugin(id) {
  const marketplacePath = join(root, "plugins", ".agents", "plugins", "marketplace.json");
  const marketplace = readJson(marketplacePath);
  if (!Array.isArray(marketplace.plugins)) {
    marketplace.plugins = [];
  }
  marketplace.plugins.push({
    name: id,
    source: {
      source: "local",
      path: `./plugins/${id}`,
    },
    policy: {
      installation: "NOT_AVAILABLE",
      authentication: "NONE",
    },
    category: "Uncategorized",
  });
  writeJson(marketplacePath, marketplace);
}

function runSyncIndex() {
  const result = spawnSync(process.execPath, ["scripts/sync.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function toSlash(value) {
  return value.replaceAll("\\", "/");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main();
