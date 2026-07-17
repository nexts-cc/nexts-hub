#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const token = process.env.GITHUB_TOKEN?.trim();
const repository = argument("--repository") ?? "nexts-cc/nexts-hub";
const selection = argument("--selection")?.trim() || "all";
const version = argument("--version") ?? "1.0.0";
const target = argument("--target") ?? "main";
const apiBase = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
if (!token) throw new Error("GITHUB_TOKEN is required for local release upload");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("--repository must use owner/name format");

const available = readdirSync(resolve(root, "mcp/_adapters/catalog/apps")).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).sort();
const availableSet = new Set(available);
const services = selection.toLowerCase() === "all"
  ? available
  : [...new Set(selection.split(",").map((value) => value.trim()).filter(Boolean))].sort();
for (const service of services) if (!availableSet.has(service)) throw new Error(`Unknown MCP adapter: ${service}`);
const releasesByTag = await loadReleasesByTag();

let completed = 0;
let skipped = 0;
for (const service of services) {
  const releaseDefinitionPath = resolve(root, `dist/mcp/${service}/catalog-release.json`);
  if (!existsSync(releaseDefinitionPath)) throw new Error(`Missing local build for ${service}; run npm run build:mcp:all first`);
  const definition = JSON.parse(readFileSync(releaseDefinitionPath, "utf8"));
  if (definition.service !== service || definition.version !== version) throw new Error(`Local release metadata mismatch for ${service}`);
  const artifactPath = isAbsolute(definition.artifactPath)
    ? definition.artifactPath
    : resolve(root, "dist/mcp", service, definition.artifactPath);
  if (!existsSync(artifactPath)) throw new Error(`Missing package artifact for ${service}: ${artifactPath}`);
  const actualHash = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
  if (actualHash !== definition.sha256) throw new Error(`SHA-256 mismatch for ${service}`);

  const tag = `mcp-${service}-v${version}`;
  let release = await selectRelease(tag, releasesByTag.get(tag) ?? []);
  if (!release) {
    release = (await github(`/repos/${repository}/releases`, {
      method: "POST",
      body: { tag_name: tag, target_commitish: target, name: `MCP ${service} v${version}`, body: `NEXTS-owned MCP adapter ${service} v${version}.`, draft: true, prerelease: false },
      allow: [201]
    })).data;
  } else {
    const expectedPackageName = basename(artifactPath);
    const present = new Map((release.assets ?? []).map((asset) => [asset.name, asset.size]));
    if (!release.draft && present.get(expectedPackageName) === statSync(artifactPath).size && present.has("catalog-release.json")) {
      skipped += 1;
      completed += 1;
      if (completed === services.length || completed % 25 === 0) process.stdout.write(`Published ${completed}/${services.length} MCP releases (${skipped} already complete).\n`);
      continue;
    }
    if (!release.draft) throw new Error(`Release ${tag} exists but is incomplete; refusing to change a published immutable release`);
  }

  await ensureAsset(release, artifactPath, "application/octet-stream");
  await ensureAsset(release, releaseDefinitionPath, "application/json");
  if (release.draft) {
    try {
      await github(`/repos/${repository}/releases/${release.id}`, { method: "PATCH", body: { draft: false } });
    } catch (error) {
      const tagConflict = error?.status === 422 && error?.data?.errors?.some((item) => item?.field === "tag_name" && item?.code === "already_exists");
      if (!tagConflict) throw error;
      process.stderr.write(`Removing orphaned package tag ${tag} before publishing its recovered draft.\n`);
      await github(`/repos/${repository}/git/refs/tags/${encodeURIComponent(tag)}`, { method: "DELETE", allow: [204] });
      await github(`/repos/${repository}/releases/${release.id}`, { method: "PATCH", body: { draft: false } });
    }
  }
  completed += 1;
  if (completed === services.length || completed % 25 === 0) process.stdout.write(`Published ${completed}/${services.length} MCP releases (${skipped} already complete).\n`);
}
process.stdout.write(`Local MCP release upload complete: ${completed - skipped} published, ${skipped} already complete.\n`);

async function loadReleasesByTag() {
  const grouped = new Map();
  for (let page = 1; ; page += 1) {
    const releases = (await github(`/repos/${repository}/releases?per_page=100&page=${page}`)).data;
    for (const release of releases) {
      const values = grouped.get(release.tag_name) ?? [];
      values.push(release);
      grouped.set(release.tag_name, values);
    }
    if (releases.length < 100) return grouped;
  }
}

async function selectRelease(tag, candidates) {
  if (!candidates.length) return null;
  const published = candidates.filter((release) => !release.draft);
  if (published.length > 1) throw new Error(`Multiple published releases unexpectedly use ${tag}`);
  const selected = published[0] ?? [...candidates].sort((left, right) =>
    (right.assets?.length ?? 0) - (left.assets?.length ?? 0) || String(left.created_at).localeCompare(String(right.created_at))
  )[0];
  for (const duplicate of candidates) {
    if (duplicate.id === selected.id) continue;
    if (!duplicate.draft) throw new Error(`Refusing to delete a published duplicate for ${tag}`);
    process.stderr.write(`Deleting duplicate draft release ${duplicate.id} for ${tag}.\n`);
    await github(`/repos/${repository}/releases/${duplicate.id}`, { method: "DELETE", allow: [204] });
  }
  return selected;
}

async function ensureAsset(release, filePath, contentType) {
  const name = basename(filePath);
  const existing = (release.assets ?? []).find((asset) => asset.name === name);
  if (existing && existing.size === statSync(filePath).size) return;
  if (existing) await github(`/repos/${repository}/releases/assets/${existing.id}`, { method: "DELETE", allow: [204] });
  const uploadBase = release.upload_url.replace(/\{.*$/, "");
  const response = await requestWithRetry(`${uploadBase}?name=${encodeURIComponent(name)}`, {
    method: "POST", headers: headers(contentType), body: readFileSync(filePath)
  }, [201]);
  if (response.status !== 201) throw new Error(`GitHub asset upload failed (${response.status}) for ${name}`);
}

async function github(path, options = {}) {
  const allowed = options.allow ?? [200];
  const response = await requestWithRetry(`${apiBase}${path}`, {
    method: options.method ?? "GET",
    headers: headers("application/vnd.github+json"),
    body: options.body ? JSON.stringify(options.body) : undefined
  }, allowed);
  return { status: response.status, data: response.data };
}

async function requestWithRetry(url, options, allowed) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (allowed.includes(response.status)) return { status: response.status, data };
    const retryable = response.status === 429 || response.status >= 500 ||
      (response.status === 403 && (/rate limit|abuse|temporarily/i.test(String(data?.message ?? data)) || response.headers.get("retry-after")));
    if (!retryable || attempt === 7) {
      const error = new Error(`GitHub request failed (${response.status}) ${url}: ${JSON.stringify(data)}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
    const resetAt = Number.parseInt(response.headers.get("x-ratelimit-reset") ?? "", 10) * 1000;
    const delay = Number.isFinite(retryAfter)
      ? Math.max(1000, retryAfter * 1000)
      : Math.max(1000, Math.min(60_000, Number.isFinite(resetAt) && resetAt > Date.now() ? resetAt - Date.now() + 1000 : 2 ** attempt * 1000));
    process.stderr.write(`GitHub rate limit or transient error; retrying in ${Math.ceil(delay / 1000)}s.\n`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
  }
  throw new Error("GitHub request retry loop exhausted");
}

function headers(contentType) {
  return { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "content-type": contentType, "user-agent": "nexts-hub-local-publisher", "x-github-api-version": "2022-11-28" };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
