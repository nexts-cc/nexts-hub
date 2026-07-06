#!/usr/bin/env node
// browser-client.js — JSON-RPC client for the Chrome Control Chrome bridge.
//
// Usage:
//   scripts/browser-client.js health
//   scripts/browser-client.js rpc <method> '<params-json>'
//   scripts/browser-client.js rpc session.start '{"url":"https://example.com"}'
//
// Connection target is fixed (127.0.0.1:18765); only BROWSER_AGENT_BRIDGE_TOKEN
// is read from the environment.
// For streamed / long-lived notifications use scripts/ws-rpc.js instead.

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Fixed connection target — NOT user-configurable. The bridge always runs on
// the local loopback at a pinned port (the native host + extension are wired to
// this address). Allowing an arbitrary host/port would only break the
// connection, and pointing automation at a non-local host is a security risk.
const HOST = "127.0.0.1";
const PORT = 18765;

function loadToken() {
  let token = process.env.BROWSER_AGENT_BRIDGE_TOKEN || "";
  if (token) return token;
  const envFile =
    process.env.BROWSER_AGENT_BRIDGE_ENV_FILE ||
    path.join(os.homedir(), ".browser-agent-bridge.env");
  try {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      if (line.startsWith("BROWSER_AGENT_BRIDGE_TOKEN=")) {
        return line.slice("BROWSER_AGENT_BRIDGE_TOKEN=".length).trim().replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // no env file — proceed unauthenticated (bridge may not require a token)
  }
  return "";
}

function request(method, urlPath, body, auth) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const headers = { accept: "application/json" };
    if (payload) {
      headers["content-type"] = "application/json";
      headers["content-length"] = payload.length;
    }
    if (auth) {
      const token = loadToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }
    const req = http.request(
      { host: HOST, port: PORT, path: urlPath, method, headers, timeout: 120000 },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            resolve({ raw: data, statusCode: res.statusCode });
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const [command, method, paramsArg] = process.argv.slice(2);

  if (!command || command === "-h" || command === "--help") {
    process.stdout.write(
      "Usage:\n  scripts/browser-client.js health\n  scripts/browser-client.js rpc <method> '<params-json>'\n"
    );
    process.exit(command ? 0 : 2);
  }

  if (command === "health") {
    const out = await request("GET", "/health", null, false);
    process.stdout.write(JSON.stringify(out) + "\n");
    return;
  }

  if (command === "rpc") {
    if (!method) {
      process.stderr.write("rpc requires a <method>\n");
      process.exit(2);
    }
    let params = {};
    if (paramsArg) {
      // On Windows, PowerShell's argument marshaling to external (non-PowerShell)
      // executables mangles embedded double-quote characters no matter how they're
      // escaped (backtick, doubled '""', or backslash) — the quotes get stripped or
      // corrupted before node ever sees them. `@<path>` sidesteps this entirely:
      // write the JSON to a file with Set-Content (a pure PowerShell string write,
      // no argv involved) and pass the file path instead of inline JSON.
      let raw = paramsArg;
      if (paramsArg.startsWith("@")) {
        raw = fs.readFileSync(paramsArg.slice(1), "utf8");
        // Windows PowerShell 5.1's `Set-Content -Encoding utf8` always writes a
        // UTF-8 BOM; strip it (U+FEFF) so JSON.parse doesn't choke on it.
        if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      }
      try {
        params = JSON.parse(raw);
      } catch (error) {
        process.stderr.write(`Invalid params JSON: ${error.message}\n`);
        process.exit(2);
      }
    }
    const body = {
      jsonrpc: "2.0",
      id: `cli-${Date.now().toString(36)}`,
      method,
      params,
    };
    const out = await request("POST", "/rpc", body, true);
    process.stdout.write(JSON.stringify(out) + "\n");
    if (out && out.error) process.exit(1);
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n`);
  process.exit(2);
}

main().catch((error) => {
  process.stderr.write(`${error && error.message ? error.message : error}\n`);
  process.exit(1);
});
