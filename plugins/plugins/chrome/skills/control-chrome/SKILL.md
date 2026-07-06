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

The bridge auto-connects (permissions pre-granted). If `/health` is unreachable, the Chrome Control extension is not loaded in Chrome — ask the user to load/enable it; do not walk them through install steps.

## Connect

**Before opening or acting on any page, first check whether Chrome is actually running — launch it only if it is not:**

```powershell
if (-not (Get-Process chrome -ErrorAction SilentlyContinue)) {
    Start-Process chrome
    Start-Sleep -Seconds 3
}
```

Do not launch Chrome unconditionally — check first, and only start it when the process check comes back empty. If you just launched it, give it a few seconds before the health check below (Chrome plus the extension need a moment to come up); if it was already running, proceed immediately with no wait.

All scripts referenced below (`scripts/install-native-host-win.ps1`, `scripts/browser-client.js`, `scripts/ws-rpc.js`) are available under `scripts/` in this plugin's root directory. This skill's own `load_skill` result includes a `<plugin_root>...</plugin_root>` line right above this text — that is this plugin's root directory. ALWAYS build absolute script paths by joining that value with `scripts\...` — never a bare relative path like `scripts/x.js` (it resolves against the chat workspace, not this plugin, and fails) and never guess or search for the path. Below, `<plugin root>` is a placeholder for that value — substitute the real absolute path, do not type the literal text `<plugin root>`. IMPORTANT: if no `<plugin_root>` line is present, stop and report that this plugin's root could not be determined — do not guess a path.

**Before every health check, always run the bundled installer first** (idempotent — safe to rerun on every turn, takes about a second, no admin rights needed). This guarantees the native host, its Chrome Native Messaging manifest, and the Windows registry entry are current, without asking the user to do anything manually. The extension ID is fixed and does not change:

```powershell
& "<plugin root>\scripts\install-native-host-win.ps1" ldgomdocohcifomdiadgchoegehldnah
```

Use the `&` call operator form shown above, not `powershell -File "..."` — a command whose text literally starts with the word `powershell` takes a different execution path that does not expand `$env:` variables, and `-File` fails with "path format not supported" on the literal unexpanded string.

Do this unconditionally, not just as a fallback after `/health` fails — run it, then proceed to the health check below. If it errors with `Copy-Item ... being used by another process` (or similar "file in use" wording), that is not fatal — it means the native host is already running from a previous registration. Ignore that specific error and proceed straight to the health check; do not retry the installer or treat this as a failure.

Health (no auth):

```bash
curl -sS http://127.0.0.1:18765/health
```

When `ok` and `extensionReady` are true, call JSON-RPC. If `/health` reports `authRequired: true`, add `Authorization: Bearer $BROWSER_AGENT_BRIDGE_TOKEN`; the bundled clients load the token automatically:

```bash
scripts/browser-client.js rpc session.start '{"url":"https://example.com"}'
scripts/browser-client.js health
scripts/ws-rpc.js '{"jsonrpc":"2.0","id":"ws-1","method":"extension.info","params":{}}'   # long-lived / streamed
```

**On Windows, do not pass the params JSON inline as shown above.** PowerShell's argument marshaling to external (non-PowerShell) executables mangles embedded double-quote characters — no escaping (backtick, doubled `""`, backslash) survives intact, and `browser-client.js` will fail with a JSON parse error. Instead write the params to a temp file and pass `@<path>`:

```powershell
$p = "$env:TEMP\rpc-params.json"
Set-Content -Path $p -Value '{"url":"https://example.com"}' -NoNewline -Encoding utf8
node "<plugin root>\scripts\browser-client.js" rpc session.start "@$p"
```

Start **one** session per task with `session.start`, then act on the returned `mainTabId` / `tabId`.

## Mandatory reading before you act

The paths below (`references/...`, `runtime/...`) are relative to **this skill's own directory** — the folder containing this skill's `SKILL.md`, i.e. the directory part of the `<skill_path>` line shown above this skill's content, NOT `<plugin_root>` (that's one level up; `<plugin_root>/skills/control-chrome` is this skill's directory). Read them with `read_file` using the bare relative path shown (e.g. `references/operating-guide.md`) — do not prepend `<plugin_root>` to them, and do not construct an absolute path yourself.

Before any browser interaction, read these in full (do not slice, summarize, or skim):

- **`references/operating-guide.md`** — the operating manual: browser safety, one-session/tab discipline, perception (wait for load → ref-first snapshot), the interaction recipe (act by ref), search & navigation (use the on-page search box, don't re-navigate), and error recovery. This is the authoritative behavior contract — follow it for every page interaction.
- **`references/protocol.md`** — per-method parameters for the JSON-RPC API.
- **`runtime/site-patterns/{domain}.md`** — site-specific selectors/waits/pitfalls; check before operating on a domain, and merge durable knowledge back after.

Do not fall back to standalone Playwright, Computer Use, web search, or another browser skill for this surface before reading and following the operating guide.
