import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const marketplacePath = path.join(root, ".agents", "plugins", "marketplace.json");

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${filePath} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

if (!existsSync(marketplacePath)) {
  fail("missing .agents/plugins/marketplace.json");
} else {
  const marketplace = readJson(marketplacePath);
  if (!Array.isArray(marketplace?.plugins)) {
    fail("marketplace must define a plugins array");
  } else {
    for (const entry of marketplace.plugins) {
      const sourcePath = entry?.source?.path;
      if (!entry?.name) {
        fail("marketplace plugin entry is missing name");
        continue;
      }
      if (!sourcePath) {
        fail(`${entry.name} is missing source.path`);
        continue;
      }

      const pluginDir = path.resolve(root, sourcePath);
      const manifestPath = path.join(pluginDir, ".nexts-plugin", "plugin.json");
      if (!existsSync(pluginDir)) {
        fail(`${entry.name} source path does not exist: ${sourcePath}`);
        continue;
      }
      if (!existsSync(manifestPath)) {
        fail(`${entry.name} is missing .nexts-plugin/plugin.json`);
        continue;
      }

      const manifest = readJson(manifestPath);
      if (manifest?.name !== entry.name) {
        fail(`${entry.name} manifest name must match marketplace entry`);
      }
      if (manifest?.skills && !existsSync(path.resolve(pluginDir, manifest.skills))) {
        fail(`${entry.name} manifest skills path does not exist`);
      }
      if (manifest?.apps && !existsSync(path.resolve(pluginDir, manifest.apps))) {
        fail(`${entry.name} manifest apps path does not exist`);
      }
    }
  }
}

if (process.exitCode) {
  process.exit();
}

console.log("plugins repository looks good");
