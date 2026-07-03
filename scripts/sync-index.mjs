#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();

export function buildAllIndexes(baseDir = root) {
  return [
    buildSkillsIndex(baseDir),
    buildPluginsIndex(baseDir),
    buildJsonCategoryIndex(baseDir, "assistants", "assistant.json"),
    buildJsonCategoryIndex(baseDir, "mcp", "mcp.json"),
  ];
}

export function readJsonFile(filePath) {
  return JSON.parse(readUtf8NoBom(filePath));
}

export function readUtf8NoBom(filePath) {
  const buffer = readFileSync(filePath);
  if (hasBom(buffer)) {
    throw new Error(`${toSlash(filePath)} has a UTF-8 BOM`);
  }
  return buffer.toString("utf8");
}

export function hasBom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

export function stableJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function toSlash(value) {
  return value.replaceAll("\\", "/");
}

function buildSkillsIndex(baseDir) {
  const category = "skills";
  const categoryRoot = join(baseDir, category);
  const itemsRoot = join(categoryRoot, "skills");
  const items = listDirectories(itemsRoot)
    .map((directoryName) => {
      const skillPath = join(itemsRoot, directoryName, "SKILL.md");
      const frontmatter = parseFrontmatter(readUtf8NoBom(skillPath), skillPath);
      return {
        id: frontmatter.name || "",
        description: frontmatter.description || "",
        path: `./skills/${directoryName}`,
      };
    })
    .sort(compareById);

  return buildIndexResult(baseDir, category, items);
}

function buildPluginsIndex(baseDir) {
  const category = "plugins";
  const categoryRoot = join(baseDir, category);
  const itemsRoot = join(categoryRoot, "plugins");
  const items = listDirectories(itemsRoot)
    .map((directoryName) => {
      const manifestPath = join(itemsRoot, directoryName, ".nexts-plugin", "plugin.json");
      const manifest = readJsonFile(manifestPath);
      return {
        id: String(manifest.id || manifest.name || ""),
        description: String(manifest.description || ""),
        path: `./plugins/${directoryName}`,
      };
    })
    .sort(compareById);

  return buildIndexResult(baseDir, category, items);
}

function buildJsonCategoryIndex(baseDir, category, manifestName) {
  const categoryRoot = join(baseDir, category);
  const items = listDirectories(categoryRoot)
    .filter((directoryName) => !directoryName.startsWith("_"))
    .map((directoryName) => {
      const manifest = readJsonFile(join(categoryRoot, directoryName, manifestName));
      return {
        id: String(manifest.id || ""),
        description: String(manifest.description || ""),
        path: `./${directoryName}`,
      };
    })
    .sort(compareById);

  return buildIndexResult(baseDir, category, items);
}

function buildIndexResult(baseDir, category, items) {
  const filePath = join(baseDir, category, "index.json");
  const version = existsSync(filePath) ? readExistingVersion(filePath) : 1;
  return {
    category,
    filePath,
    content: stableJson({ version, items }),
  };
}

function readExistingVersion(filePath) {
  const current = readJsonFile(filePath);
  return current.version ?? 1;
}

function parseFrontmatter(content, filePath) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error(`${toSlash(filePath)} must start with YAML frontmatter`);
  }

  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error(`${toSlash(filePath)} must close YAML frontmatter`);
  }

  const data = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    data[key] = value;
  }
  return data;
}

function listDirectories(directoryPath) {
  if (!existsSync(directoryPath)) {
    return [];
  }

  return readdirSync(directoryPath)
    .filter((entry) => {
      const fullPath = join(directoryPath, entry);
      return statSync(fullPath).isDirectory();
    });
}

function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const results = buildAllIndexes(root);
  const mismatches = [];

  for (const result of results) {
    if (checkOnly) {
      const current = existsSync(result.filePath) ? readFileSync(result.filePath, "utf8") : "";
      if (current !== result.content) {
        mismatches.push(`${result.category}/index.json is out of date; run npm run sync-index`);
      }
      continue;
    }

    mkdirSync(join(root, result.category), { recursive: true });
    writeFileSync(result.filePath, result.content, "utf8");
    console.log(`wrote ${result.category}/index.json`);
  }

  if (mismatches.length > 0) {
    for (const mismatch of mismatches) {
      console.error(mismatch);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  main();
}
