---
name: computer-use
description: Control Windows apps from Nexts
---

# Computer Use

Use this skill when the user asks Nexts to inspect or control the local Windows desktop.

This plugin is host-managed. Do not use PowerShell, shell screenshot scripts, SendKeys, Node REPL, Sky APIs, or ad hoc UI automation as a fallback before using the `computer-use` plugin tools. Private screenshots and desktop state stay local.

## Required Workflow

1. Load this skill before any Windows desktop inspection or control.
2. Call `plugin__computer-use__request_access` once per session with a short reason.
3. Resume existing desktop state before launching anything. If the user asks to continue, add to an existing drawing/document, or work in an app that may already be open, first call `get_state` and then `list_apps` or `list_windows` to find the existing target window.
4. If the target window is already open, continue from that window with `get_window_state({ window_id, include_screenshot: true })`; do not restart the task or call `launch_app`.
5. Use `launch_app` only when the target app is not already visible/running, or when the user explicitly asks to open a fresh app/window.
6. Use the smallest passive observation tool that can answer the question.
7. For stable coordinate work, batch related actions with `run_sequence`, then verify once with `get_window_state` or `screenshot`.
8. Use single input tools only when one action needs a separate confirmation or the UI may have changed.
9. Before claiming the desktop task is complete, take a final observation of the target window with `get_window_state({ window_id, include_screenshot: true })` when a target window exists, or `screenshot({})` for whole-desktop tasks. Use that final observation to confirm the requested visible result is actually present. If the final observation does not show the expected result, continue or report the exact mismatch instead of saying the task is complete.

## Visual-First Coordinate Logic

Computer Use is primarily visual. For coordinate-based actions, first capture the target screen or window with `get_window_state({ window_id, include_screenshot: true })` or `screenshot({})`, inspect the image, and choose coordinates from what is visibly shown. The screenshot is forwarded by the host into the next multimodal model turn as an image attachment.

Use `get_accessibility_tree` as an auxiliary semantic signal for buttons, menus, text fields, lists, and other UI Automation controls. Do not depend on the accessibility tree for canvas, drawing, video, game, webview, custom-rendered, or weakly accessible apps. If the tree is empty or sparse, continue from the screenshot instead of blocking.

For "what is on my screen" or "screenshot and describe it", call:

1. `plugin__computer-use__request_access`
2. `plugin__computer-use__screenshot`

If screenshot capture succeeds, the tool output stays compact and the host forwards the cached image into the next multimodal model turn.

## Available Tools

### Access

- `request_access({ reason })`

Requests user-approved Computer Use access for the current conversation session. All other tools require this first.

### Passive Observation

- `get_state({})`
- `list_apps({})`
- `get_window({ id })`
- `get_window_state({ window_id?, include_screenshot? })`
- `get_accessibility_tree({ window_id? })`
- `screenshot({})`
- `list_windows({})`
- `get_foreground_window({})`
- `get_cursor_position({})`

Use `get_state` when you need a compact status snapshot before acting. It returns availability, foreground window, cursor position, and visible window count. Use `list_apps` to discover running apps and their visible windows. Use `get_window_state` to inspect a selected window and capture a screenshot for visual reasoning. Use passive observation before input whenever possible.

### App/Window Lifecycle

- `launch_app({ app })`

Use `launch_app` after `request_access` when the user asks to open a normal Windows app such as Paint, Notepad, Calculator, Settings, or a known executable path, but only after checking whether the requested app is already open with `get_state` and `list_apps`/`list_windows`. If an existing matching window is present, use that window instead of launching another instance.

App-level allowlists are not implemented yet, so this uses the session-level Computer Use grant. Shell, terminal, and script host apps such as PowerShell, Command Prompt, Windows Terminal, WScript, CScript, MSHTA, Rundll32, and Regsvr32 require explicit risk confirmation. If the user really wants one of those apps, explain the risk first, then call `launch_app({ app, allow_risky: true })`.

## Continuation Behavior

Treat follow-up user requests in the same conversation as continuation requests by default. Examples include "继续", "在旁边画一个猫", "再加一点", "帮我把刚才那个窗口...", or any request that refers to an already-open app, screen, drawing, document, or prior desktop operation.

For continuation requests:

1. Call `request_access` if the current session has not already granted access.
2. Call `get_state`.
3. If the foreground window looks like the target app, call `get_window_state` for it.
4. Otherwise call `list_apps` or `list_windows`, choose the existing target window, then call `get_window_state`.
5. Continue acting in the existing window.
6. Only call `launch_app` if no suitable existing target window is found.

Do not say that no Computer Use interface is available after this skill is loaded and the plugin tools are present. If access is missing, request access. If a window id is stale, refresh with `get_state` and `list_apps`/`list_windows`.

### Mouse Input

- `move_mouse({ coordinate: [x, y] })`
- `click_element({ element_index })`
- `run_sequence({ actions })`
- `left_click({ coordinate: [x, y] })`
- `right_click({ coordinate: [x, y] })`
- `middle_click({ coordinate: [x, y] })`
- `double_click({ coordinate: [x, y] })`
- `scroll({ x, y, scroll_x, scroll_y })`
- `drag({ from_x, from_y, to_x, to_y })`

Coordinates are screen coordinates and must stay within the virtual screen bounds. Input tools require confirmation.

`get_accessibility_tree` first tries to read the target window through Windows UI Automation and returns indexed controls with role, name, bounds, and available automation metadata. If UI Automation is unavailable for that window, it falls back to indexed visible-window pseudo-elements. `click_element` clicks the center of the indexed element; after layout changes, refresh the tree before reusing an index.

Use `run_sequence` when you already have a stable screenshot, canvas, or work surface and need several related actions, such as multiple drawing drags, click + type + Enter, or focus + keyboard shortcuts. Supported action tools are `move_mouse`, `left_click`, `right_click`, `middle_click`, `double_click`, `scroll`, `drag`, `key_press`, `type_text`, and `wait`. After a sequence that may change layout, take one fresh observation before choosing new coordinates or element indexes.

For drawing, editing, typing, launching, or navigation tasks, do not finish from input tool success alone. A successful click, drag, key press, or sequence only means the input was sent. Finish only after a fresh screenshot/window state verifies the visible result.

### Keyboard Input

- `key_press({ key })`
- `type_text({ text })`

Use `key_press` for Enter, Escape, Tab, arrows, and safe shortcuts such as `Ctrl+A`. Use `type_text` for literal text. System shortcuts such as Windows key combinations, `Alt+Tab`, `Alt+F4`, and `Ctrl+Alt+Delete` are blocked.

## Safety Rules

- Do not automate passwords, password managers, Windows security apps, anti-malware apps, or authentication dialogs.
- Do not use Windows Run, terminal apps, PowerShell, Command Prompt, or shell scripts through UI automation.
- For shell, terminal, or script host apps, ask for explicit user confirmation before using `allow_risky: true`. Do not automate commands inside them unless the user separately asks and confirms the exact action.
- Do not launch security, password manager, or authentication tools through Computer Use.
- Confirm before actions that send messages, submit forms, upload files, install software, delete data, change permissions, or transmit sensitive data.
- Stop if the user interrupts Computer Use or if access is denied.

## Known Limits

- Current Nexts implementation is Windows-first and uses native Tauri host commands.
- The current plugin tools operate on desktop/screen coordinates, window metadata, and Windows UI Automation where available.
- Current `list_apps` is derived from visible windows and process paths. It is not a complete installed-app inventory yet.
- `get_window_state` supports window metadata, cursor state, optional screenshots, and a UI Automation control tree with visible-window fallback.
- Native input is rate-limited in the host in addition to frontend per-session input limits.
