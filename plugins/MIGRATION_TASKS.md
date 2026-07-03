# Codex Cache Plugin Migration Tasks

These packages are copied from `C:\Users\safranyu\.codex\plugins\cache` and adapted to the NextsAI plugin catalog.

## Batch 1: Document Runtime Packages

- [x] `pdf` from `openai-primary-runtime/pdf/26.623.12021`.
- [x] `documents` from `openai-primary-runtime/documents/26.623.12021`.
- [x] `spreadsheets` from `openai-primary-runtime/spreadsheets/26.623.12021`.
- [x] `presentations` from `openai-primary-runtime/presentations/26.623.12021`.
- [x] `template-creator` from `openai-primary-runtime/template-creator/26.623.12021`.

## Batch 2: Host Automation Packages

- [x] `browser` from `openai-bundled/browser/26.616.81150`.
- [x] `chrome` from `openai-bundled/chrome/26.616.81150`.
- [x] `computer-use` from `openai-bundled/computer-use/26.616.81150`.

## Batch 3: Connector Packages

- [x] `gmail` from `openai-curated-remote/gmail/0.1.3`.
- [x] `google-calendar` from `openai-curated-remote/google-calendar/1.2.3`.
- [x] `outlook-email` from `openai-curated-remote/outlook-email/0.1.3`.

## Batch 4: Engineering Workflow Package

- [x] `superpowers` from `openai-curated-remote/superpowers/5.1.4`.

## Parity Documentation

- [x] Add `CODEX_PARITY_MAP.md` describing package-by-package cache mapping.
- [x] Preserve Nexts naming conventions: `.nexts-plugin/plugin.json` and `agents/nextsai.yaml`.
- [x] Preserve copied source assets and manifest logo/composerIcon references.

## Runtime Follow-Ups

- [ ] Wire document packages to local PDF/Office workers and visual render verification.
- [ ] Expose browser/chrome/computer-use through explicit host capability permissions and audit logs.
- [ ] Implement Google/Microsoft connector OAuth through the Nexts host, never through account-service content storage.
- [ ] Add per-plugin capability declarations for filesystem, browser, desktop-control, mail, and calendar actions.
- [ ] Add original Nexts references/evals for migrated packages where Codex has large reference folders.
