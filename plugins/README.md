# NextsAI Plugins

Official plugin catalog for NextsAI.

This repository defines the NextsAI plugin catalog shape: each plugin lives under `plugins/<name>/` with a required `.nexts-plugin/plugin.json` manifest, optional skills, assets, and companion files. The default marketplace lives at `.agents/plugins/marketplace.json`.

## Plugins

- `plugins/pdf` - Local-first PDF read, render, inspect, and generation workflows.
- `plugins/documents` - Word/docx creation, editing, review, and render-verification workflows.
- `plugins/spreadsheets` - Spreadsheet analysis, editing, formulas, charts, and export workflows.
- `plugins/presentations` - Slide deck creation, editing, export, and visual QA workflows.
- `plugins/template-creator` - Build reusable Nexts artifact-template skills from user files.
- `plugins/browser` - Control the Nexts in-app browser for local web app inspection and testing.
- `plugins/chrome` - Control the user's Chrome session when logged-in browser state is required.
- `plugins/computer-use` - Host-level desktop observation and controlled Windows input workflows.
- `plugins/gmail` - The official NextsAI Gmail plugin, including the `gmail` and `gmail-inbox-triage` skills.
- `plugins/google-calendar` - Calendar briefs, scheduling, availability, meeting prep, and time cleanup workflows.
- `plugins/outlook-email` - Outlook triage, summaries, task extraction, and reply drafting workflows.
- `plugins/superpowers` - Planning, debugging, TDD, verification, review, worktree, and skill-writing workflows.

## Bundled Skill Coverage

- `plugins/google-calendar` includes `google-calendar`, `google-calendar-daily-brief`, `google-calendar-free-up-time`, `google-calendar-group-scheduler`, and `google-calendar-meeting-prep`.
- `plugins/outlook-email` includes `outlook-email`, `outlook-email-inbox-triage`, `outlook-email-reply-drafting`, `outlook-email-shared-mailboxes`, `outlook-email-subscription-cleanup`, and `outlook-email-task-extraction`.
- `plugins/superpowers` includes brainstorming, planning, TDD, debugging, code review, worktrees, subagent-driven development, and skill writing.

## Install

Add this repository as a plugin source, then install plugins from the marketplace entries:

```text
https://github.com/nexts-cc/plugins.git
```

Marketplace entries point to local packages such as:

```text
./plugins/gmail
./plugins/pdf
./plugins/browser
```

## Develop

Create a new plugin from the template:

```bash
cp -a templates/basic-plugin plugins/my-plugin
```

Then replace placeholders in:

- `plugins/my-plugin/.nexts-plugin/plugin.json`
- `plugins/my-plugin/skills/basic-skill/SKILL.md`

Plugin packages should keep this shape:

```text
plugins/<name>/
  .nexts-plugin/plugin.json
  skills/<skill-name>/SKILL.md
  assets/
```

Add the package to `.agents/plugins/marketplace.json` so Nexts can discover it from the catalog.

```bash
node scripts/validate-repo.mjs
```

## Cache Parity

See `CODEX_PARITY_MAP.md` for the local Codex Desktop cache to NextsAI plugin mapping. Cache packages are copied as-is where possible and adapted to Nexts conventions such as `.nexts-plugin/plugin.json` and `agents/nextsai.yaml`.
