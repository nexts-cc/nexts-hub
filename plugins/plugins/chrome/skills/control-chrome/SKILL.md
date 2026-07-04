---
name: control-chrome
description: Control the user's real, logged-in Chrome through the Chrome Control bridge. Trigger when the user asks to open, inspect, click, type in, fill, search, or screenshot a web page using their own Chrome (logged-in sites, current tabs, cookies). The release includes a bundled Windows native host at skills/control-chrome/extension-host/windows/x64/host.exe; call JSON-RPC at http://127.0.0.1:18765/rpc after the extension and host are installed. Operate text/ref first; screenshots are a fallback.
---

# Chrome Control

Drive the user's real, logged-in Chrome through the Chrome Control bridge. The extension contains no model — you call the local JSON-RPC endpoint, which forwards to Chrome over Native Messaging.

```text
Agent -> 127.0.0.1:18765 /rpc -> native host -> Chrome Control extension -> Chrome (CDP)
```

Windows release bundles include `skills/control-chrome/extension-host/windows/x64/host.exe`. The Windows installer registers that native host and writes the Native Messaging manifest, so end-user machines do not need Python; source checkouts can still fall back to `native/host.py` for development.

The bridge auto-connects (no disclaimer, no "Start Bridge", permissions pre-granted). Just call it. If `/health` is unreachable, use the Connect recovery step below.

This bridge controls the user's local Chrome; do not use it for public web research.

## Connect

Health (no auth):

```bash
curl -sS http://127.0.0.1:18765/health
```

When `ok` and `extensionReady` are true, call JSON-RPC. If `/health` reports `authRequired: true`, add `Authorization: Bearer $BROWSER_AGENT_BRIDGE_TOKEN`; the bundled clients load the token automatically:

```bash
scripts/browser_bridge_client.py rpc session.start '{"url":"https://example.com"}'
scripts/ws-rpc.js '{"jsonrpc":"2.0","id":"ws-1","method":"extension.info","params":{}}'   # long-lived / streamed
```

If `/health` is unreachable, run `node scripts/ensure-chrome.js`; it starts Chrome if it is not running and waits for the bridge. Follow its printed advice: it will tell you when to run `node scripts/install-host.js` (first-time setup; then ask the user to fully restart Chrome) or to ask the user to enable the extension.

Start **one** session per task with `session.start`, then act on the returned `mainTabId` / `tabId`.

## Mandatory reading before you act

Before any browser interaction, read these in full (do not slice, summarize, or skim):

- **`references/operating-guide.md`** — the operating manual: browser safety, one-session/tab discipline, perception (wait for load → ref-first snapshot), the interaction recipe (act by ref), search & navigation (use the on-page search box, don't re-navigate), and error recovery. This is the authoritative behavior contract — follow it for every page interaction.
- **`references/protocol.md`** — per-method parameters for the JSON-RPC API.
- **`runtime/site-patterns/{domain}.md`** — site-specific selectors/waits/pitfalls; check before operating on a domain, and merge durable knowledge back after.

Do not fall back to standalone Playwright, Computer Use, web search, or another browser skill for this surface before reading and following the operating guide.

## Critical perception rule

After `session.start`, `session.createTab`, `tabs.create`, `page.navigate`, or any click that loads SPA content, do not act from the first immediate read. First obtain a rendered semantic snapshot with `page.ariaSnapshot` or `page.accessibilityTree({"format":"compact"})` using a timeout. Treat an empty snapshot, an empty `RootWebArea`, or a tiny/noisy node list as "not rendered yet"; wait for a target condition (`page.waitForSelector`, `page.waitForText`, `locator.waitFor`, `page.waitForNetworkIdle`) or retry the semantic snapshot before choosing a ref.

## Critical tab rule

Use one session/group per task. Before opening a new tab or starting another session, call `session.get` to reuse tabs already in the session. If the target page may already be open in the user's Chrome, call `tabs.findUserTabs` and then `tabs.claimUserTab` to bring the selected tab into the current session. Only create a new tab when no existing or claimable tab fits.
