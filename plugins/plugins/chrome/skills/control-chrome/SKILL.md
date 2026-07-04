---
name: control-chrome
description: Control the user's real, logged-in Chrome through the Chrome Control bridge. Trigger when the user asks to open, inspect, click, type in, fill, search, or screenshot a web page using their own Chrome (logged-in sites, current tabs, cookies). The plugin includes a bundled Windows native host at extension-host/windows/x64/host.exe; use Chrome when the task needs the user's own browser state or the user explicitly asks for Chrome. Operate text/ref first; screenshots are a fallback.
---

# Chrome — Chrome Control bridge

Drive the user's real, logged-in Chrome. The Chrome extension contains no model — you call a local JSON-RPC endpoint, which forwards to Chrome over Native Messaging.

```text
Agent -> 127.0.0.1:18765 /rpc -> native host -> Chrome Control extension -> Chrome (CDP)
```

Windows plugin bundles include `extension-host/windows/x64/host.exe`. The Windows installer registers that native host and writes the Native Messaging manifest, so end-user machines do not need Python; source checkouts can still fall back to `native/host.py` for development.

Use Chrome when the task needs the user's existing Chrome state (open tabs, logged-in sessions, cookies) or the user explicitly asks for Chrome. Do not switch to Chrome just because another connector's auth expired — ask the user to fix auth or approve Chrome as a fallback. This bridge controls the user's local Chrome; do not use it for public web research.

The bridge auto-connects (permissions pre-granted). If `/health` is unreachable, use the Connect recovery step below.

## Connect

Health (no auth):

```bash
curl -sS http://127.0.0.1:18765/health
```

If `/health` is unreachable on Windows, first run `node scripts/install-host.js`; it idempotently writes the token env file, native-host wrapper, Chrome Native Messaging manifest, and HKCU registry entry without administrator rights. Ask the user to fully restart Chrome, then try health again. If it still fails, ask them to confirm the Chrome Control extension is enabled.

When `ok` and `extensionReady` are true, call JSON-RPC. If `/health` reports `authRequired: true`, add `Authorization: Bearer $BROWSER_AGENT_BRIDGE_TOKEN`; the bundled clients load the token automatically:

```bash
scripts/browser-client.js rpc session.start '{"url":"https://example.com"}'
scripts/browser-client.js health
scripts/ws-rpc.js '{"jsonrpc":"2.0","id":"ws-1","method":"extension.info","params":{}}'   # long-lived / streamed
```

Start **one** session per task with `session.start`, then act on the returned `mainTabId` / `tabId`.

## Mandatory reading before you act

Before any browser interaction, read these in full (do not slice, summarize, or skim):

- **`references/operating-guide.md`** — the operating manual: browser safety, one-session/tab discipline, perception (wait for load → ref-first snapshot), the interaction recipe (act by ref), search & navigation (use the on-page search box, don't re-navigate), and error recovery. This is the authoritative behavior contract — follow it for every page interaction.
- **`references/protocol.md`** — per-method parameters for the JSON-RPC API.
- **`runtime/site-patterns/{domain}.md`** — site-specific selectors/waits/pitfalls; check before operating on a domain, and merge durable knowledge back after.

Do not fall back to standalone Playwright, Computer Use, web search, or another browser skill for this surface before reading and following the operating guide.
