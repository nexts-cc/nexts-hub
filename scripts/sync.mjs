#!/usr/bin/env node

// Regenerates the per-category marketplace registries (the `.agents`
// marketplace format, mirroring plugins/.agents/plugins/marketplace.json):
//   skills/.agents/skills/marketplace.json
//   assistants/.agents/assistants/marketplace.json
//   mcp/.agents/mcp/marketplace.json
// The plugins marketplace stays authoritative and hand-maintained; this
// script only checks it for consistency against the plugins on disk.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import process from "node:process";

const root = process.cwd();

export function buildAllRegistries(baseDir = root) {
  return [
    buildSkillsRegistry(baseDir),
    buildDirCategoryRegistry(baseDir, "assistants", "NextsAI Assistants"),
    buildDirCategoryRegistry(baseDir, "mcp", "NextsAI MCP"),
  ];
}

export function checkPluginsMarketplace(baseDir = root) {
  const problems = [];
  const marketplacePath = join(baseDir, "plugins", ".agents", "plugins", "marketplace.json");
  if (!existsSync(marketplacePath)) {
    return [`plugins/.agents/plugins/marketplace.json is missing`];
  }

  const marketplace = JSON.parse(readUtf8NoBom(marketplacePath));
  const registered = new Set((marketplace.plugins ?? []).map((entry) => entry.name));
  const onDisk = new Set(listDirectories(join(baseDir, "plugins", "plugins")));

  for (const name of onDisk) {
    if (!registered.has(name)) {
      problems.push(
        `plugins/plugins/${name} exists on disk but is not registered in plugins/.agents/plugins/marketplace.json`
      );
    }
  }
  for (const name of registered) {
    if (!onDisk.has(name)) {
      problems.push(
        `plugins marketplace entry "${name}" has no matching plugins/plugins/${name} directory`
      );
    }
  }
  return problems;
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

// Per-category content hashes. Computed from the category's source-of-truth
// files, so any content change flips the hash automatically — the app compares
// these against its locally recorded state to decide whether to update, and
// nobody has to remember to bump a version by hand.
export function computeCategoryHashes(baseDir = root) {
  return {
    skills: hashPaths(baseDir, [join("skills", "skills")]),
    plugins: hashPaths(baseDir, [
      join("plugins", "plugins"),
      join("plugins", ".agents", "plugins", "marketplace.json"),
    ]),
    assistants: hashPaths(baseDir, contentDirs(baseDir, "assistants")),
    mcp: hashPaths(baseDir, [...contentDirs(baseDir, "mcp"), join("mcp", "_adapters")]),
  };
}

function contentDirs(baseDir, category) {
  return listDirectories(join(baseDir, category))
    .filter(
      (directoryName) =>
        !directoryName.startsWith("_") &&
        directoryName !== ".agents" &&
        directoryName !== "templates"
    )
    .map((directoryName) => join(category, directoryName));
}

function hashPaths(baseDir, relativePaths) {
  const files = [];
  for (const relativePath of relativePaths) {
    collectFiles(baseDir, relativePath, files);
  }
  files.sort();

  const digest = createHash("sha256");
  for (const relativeFile of files) {
    const bytes = readFileSync(join(baseDir, relativeFile));
    digest.update(relativeFile);
    digest.update("\0");
    digest.update(String(bytes.length));
    digest.update("\0");
    digest.update(bytes);
  }
  return `sha256:${digest.digest("hex")}`;
}

function collectFiles(baseDir, relativePath, out) {
  const fullPath = join(baseDir, relativePath);
  if (!existsSync(fullPath)) {
    return;
  }
  if (statSync(fullPath).isFile()) {
    out.push(toSlash(relativePath));
    return;
  }
  for (const entry of readdirSync(fullPath)) {
    collectFiles(baseDir, join(relativePath, entry), out);
  }
}

export function buildTopLevelIndex(baseDir = root) {
  const indexPath = join(baseDir, "index.json");
  const index = JSON.parse(readUtf8NoBom(indexPath));
  const hashes = computeCategoryHashes(baseDir);
  for (const [category, hash] of Object.entries(hashes)) {
    if (index.categories?.[category]) {
      index.categories[category].hash = hash;
    }
  }
  return { filePath: indexPath, content: stableJson(index) };
}

function buildSkillsRegistry(baseDir) {
  const entries = listDirectories(join(baseDir, "skills", "skills"))
    .map((directoryName) => ({
      name: directoryName,
      source: { source: "local", path: `./skills/${directoryName}` },
    }))
    .sort(compareByName);

  return {
    category: "skills",
    filePath: join(baseDir, "skills", ".agents", "skills", "marketplace.json"),
    content: stableJson({
      name: "nextsai-skills",
      interface: { displayName: "NextsAI Skills" },
      skills: entries,
    }),
  };
}

function buildDirCategoryRegistry(baseDir, category, displayName) {
  const entries = listDirectories(join(baseDir, category))
    .filter(
      (directoryName) =>
        !directoryName.startsWith("_") &&
        directoryName !== ".agents" &&
        directoryName !== "templates"
    )
    .map((directoryName) => ({
      name: directoryName,
      source: { source: "local", path: `./${directoryName}` },
    }))
    .sort(compareByName);

  return {
    category,
    filePath: join(baseDir, category, ".agents", category, "marketplace.json"),
    content: stableJson({
      name: `nextsai-${category}`,
      interface: { displayName },
      [category]: entries,
    }),
  };
}

function listDirectories(directoryPath) {
  if (!existsSync(directoryPath)) {
    return [];
  }

  return readdirSync(directoryPath)
    .filter((entry) => statSync(join(directoryPath, entry)).isDirectory());
}

function compareByName(left, right) {
  return left.name.localeCompare(right.name);
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const mismatches = [];
  const outputs = [...buildAllRegistries(root), buildTopLevelIndex(root)];

  for (const result of outputs) {
    const relative = toSlash(result.filePath.slice(root.length + 1));
    if (checkOnly) {
      const current = existsSync(result.filePath) ? readFileSync(result.filePath, "utf8") : "";
      if (current !== result.content) {
        mismatches.push(`${relative} is out of date; run npm run sync`);
      }
      continue;
    }

    mkdirSync(dirname(result.filePath), { recursive: true });
    writeFileSync(result.filePath, result.content, "utf8");
    console.log(`wrote ${relative}`);
  }

  mismatches.push(...checkPluginsMarketplace(root));

  if (mismatches.length > 0) {
    for (const mismatch of mismatches) {
      console.error(mismatch);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop())) {
  main();
}
