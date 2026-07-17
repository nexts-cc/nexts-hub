#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPaths } from "./sync.mjs";

const directory = mkdtempSync(join(tmpdir(), "nexts-hub-hash-"));
try {
  const textPath = join(directory, "manifest.json");
  writeFileSync(textPath, "{\r\n  \"id\": \"gmail\"\r\n}\r\n", "utf8");
  const windowsHash = hashPaths(directory, ["manifest.json"]);
  writeFileSync(textPath, "{\n  \"id\": \"gmail\"\n}\n", "utf8");
  const linuxHash = hashPaths(directory, ["manifest.json"]);
  assert.equal(windowsHash, linuxHash, "text hashes must be identical for CRLF and LF checkouts");
  process.stdout.write("Cross-platform content hash test passed.\n");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
