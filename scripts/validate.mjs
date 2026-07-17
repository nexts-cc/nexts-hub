#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  buildAllRegistries,
  buildTopLevelIndex,
  checkPluginsMarketplace,
  hasBom,
  readJsonFile,
  readUtf8NoBom,
  toSlash,
} from "./sync.mjs";

const root = process.cwd();
const errors = [];

validateHub();
runChildValidator("skills", join("scripts", "validate-repo.mjs"));
runChildValidator("plugins", join("scripts", "validate-repo.mjs"));

if (errors.length > 0) {
  console.error("Hub validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Hub validation passed.");

function validateHub() {
  validateTopLevelIndex();
  validateSkills();
  validatePlugins();
  validateJsonCategory("assistants", "assistant.json", ["id", "display_name", "description", "system_prompt"]);
  validateJsonCategory("mcp", "mcp.json", ["id", "display_name", "description", "transport"]);
  validateMcpAdapterSources();
  validateRegistriesCurrent();
}

function validateMcpAdapterSources() {
  const adaptersRoot = join(root, "mcp", "_adapters");
  const catalogRoot = join(adaptersRoot, "catalog", "apps");
  const providersRoot = join(adaptersRoot, "src", "providers");
  if (!existsSync(catalogRoot) || !existsSync(providersRoot)) {
    errors.push("mcp/_adapters catalog or provider sources are missing");
    return;
  }

  const catalogFiles = readdirSync(catalogRoot).filter((entry) => entry.endsWith(".json"));
  if (catalogFiles.length !== 1075) {
    errors.push(`mcp/_adapters must contain 1075 catalog entries; found ${catalogFiles.length}`);
  }
  for (const file of catalogFiles) {
    const service = file.slice(0, -5);
    const definition = readJson(join(catalogRoot, file));
    if (definition?.service !== service) errors.push(`mcp/_adapters/catalog/apps/${file} service does not match its filename`);
    if (!existsSync(join(providersRoot, service, "executors.ts"))) {
      errors.push(`mcp/_adapters/src/providers/${service}/executors.ts is missing`);
    }
  }

  const publishedRoot = join(root, "mcp");
  for (const id of listDirectories(publishedRoot).filter((entry) => !entry.startsWith("_") && entry !== "templates")) {
    const manifestPath = join(publishedRoot, id, "mcp.json");
    if (!existsSync(manifestPath)) continue;
    if (/https?:\/\/(?:127\.0\.0\.1|localhost)(?=[:/]|$)/i.test(readFileSync(manifestPath, "utf8"))) {
      errors.push(`mcp/${id}/mcp.json must not publish a localhost runtime`);
    }
  }
}

function validateTopLevelIndex() {
  const topLevelPath = join(root, "index.json");
  if (!existsSync(topLevelPath)) {
    errors.push("index.json is missing");
    return;
  }

  const index = readJson(topLevelPath);
  for (const category of ["skills", "plugins", "assistants", "mcp"]) {
    const entry = index?.categories?.[category];
    if (!entry) {
      errors.push(`index.json categories.${category} is missing`);
      continue;
    }
    if (!entry.registry) {
      errors.push(`index.json categories.${category}.registry is missing`);
      continue;
    }
    if (!existsSync(join(root, entry.registry))) {
      errors.push(`index.json categories.${category}.registry points to a missing file: ${entry.registry}`);
    }
  }
}

function validateSkills() {
  const itemsRoot = join(root, "skills", "skills");
  for (const id of listDirectories(itemsRoot)) {
    const skillPath = join(itemsRoot, id, "SKILL.md");
    if (!existsSync(skillPath)) {
      errors.push(`skills/skills/${id}/SKILL.md is missing`);
      continue;
    }

    const content = readText(skillPath);
    if (content === undefined) {
      continue;
    }
    const frontmatter = parseFrontmatter(content, skillPath);
    if (frontmatter.name !== id) {
      errors.push(`skills/skills/${id}/SKILL.md name must match directory name`);
    }
  }
}

function validatePlugins() {
  const itemsRoot = join(root, "plugins", "plugins");
  for (const id of listDirectories(itemsRoot)) {
    const manifestPath = join(itemsRoot, id, ".nexts-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      errors.push(`plugins/plugins/${id}/.nexts-plugin/plugin.json is missing`);
      continue;
    }

    const manifest = readJson(manifestPath);
    const manifestId = manifest?.id || manifest?.name;
    if (manifestId !== id) {
      errors.push(`plugins/plugins/${id}/.nexts-plugin/plugin.json id/name must match directory name`);
    }
  }
}

function validateJsonCategory(category, manifestName, requiredFields) {
  const categoryRoot = join(root, category);
  const skipped = (entry) =>
    entry.startsWith("_") || entry === ".agents" || entry === "templates";
  for (const id of listDirectories(categoryRoot).filter((entry) => !skipped(entry))) {
    const manifestPath = join(categoryRoot, id, manifestName);
    if (!existsSync(manifestPath)) {
      errors.push(`${category}/${id}/${manifestName} is missing`);
      continue;
    }

    const manifest = readJson(manifestPath);
    if (manifest?.id !== id) {
      errors.push(`${category}/${id}/${manifestName} id must match directory name`);
    }
    for (const field of requiredFields) {
      if (manifest?.[field] === undefined || manifest[field] === "") {
        errors.push(`${category}/${id}/${manifestName} is missing required field ${field}`);
      }
    }
  }
}

function validateRegistriesCurrent() {
  for (const result of [...buildAllRegistries(root), buildTopLevelIndex(root)]) {
    const relative = toSlash(result.filePath.slice(root.length + 1));
    if (!existsSync(result.filePath)) {
      errors.push(`${relative} is missing; run npm run sync`);
      continue;
    }

    const current = readFileSync(result.filePath, "utf8");
    if (current !== result.content) {
      errors.push(`${relative} is out of date; run npm run sync`);
    }
  }

  errors.push(...checkPluginsMarketplace(root));
}

function runChildValidator(category, scriptPath) {
  const categoryRoot = join(root, category);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: categoryRoot,
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    errors.push(`${category}/${toSlash(scriptPath)} failed`);
  }
}

function readJson(filePath) {
  try {
    return readJsonFile(filePath);
  } catch (error) {
    errors.push(`${toSlash(filePath)} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

function readText(filePath) {
  try {
    return readUtf8NoBom(filePath);
  } catch (error) {
    errors.push(error.message);
    return undefined;
  }
}

function parseFrontmatter(content, filePath) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    errors.push(`${toSlash(filePath)} must start with YAML frontmatter`);
    return {};
  }

  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    errors.push(`${toSlash(filePath)} must close YAML frontmatter`);
    return {};
  }

  const data = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    data[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return data;
}

function listDirectories(directoryPath) {
  if (!existsSync(directoryPath)) {
    errors.push(`${toSlash(directoryPath)} is missing`);
    return [];
  }

  return readdirSync(directoryPath)
    .filter((entry) => statSync(join(directoryPath, entry)).isDirectory());
}

function checkBom(filePath) {
  if (hasBom(readFileSync(filePath))) {
    errors.push(`${toSlash(filePath)} has a UTF-8 BOM`);
  }
}
