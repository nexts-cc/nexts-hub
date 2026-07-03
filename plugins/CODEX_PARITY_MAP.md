# Codex Parity Map

This catalog follows the local Codex Desktop plugin cache at the package, directory, and document level. Cache packages are copied into the NextsAI plugin catalog and mechanically adapted to NextsAI conventions.

## Migration Rule

- Use `.nexts-plugin/plugin.json`, not `.codex-plugin/plugin.json`.
- Use `agents/nextsai.yaml`, not `agents/openai.yaml`.
- Keep each plugin installable on its own.
- Prefer many focused skills over one large generic skill when the source package exposes separate workflows.
- Preserve upstream author, license, asset, script, reference, and README files unless a field must be adapted for Nexts.

## Package Mapping

| Codex package | Codex shape observed locally | Nexts package | Current parity | Notes |
| --- | --- | --- | --- | --- |
| `pdf` | plugin manifest, README, icon/logo assets, `skills/pdf`, agent config, PDF asset | `plugins/pdf` | Cache copied/adapted | Source `openai-primary-runtime/pdf/26.623.12021`. |
| `documents` | docx skill with render script, OOXML references, tasks, examples, troubleshooting | `plugins/documents` | Cache copied/adapted | Source `openai-primary-runtime/documents/26.623.12021`. |
| `spreadsheets` | spreadsheet skill with charts, style, routing, and domain guides | `plugins/spreadsheets` | Cache copied/adapted | Source `openai-primary-runtime/spreadsheets/26.623.12021`. |
| `presentations` | deck creation/editing/visual QA skill plus helper tooling | `plugins/presentations` | Cache copied/adapted | Source `openai-primary-runtime/presentations/26.623.12021`. |
| `template-creator` | artifact-template creation skill and scripts | `plugins/template-creator` | Cache copied/adapted | Source `openai-primary-runtime/template-creator/26.623.12021`. |
| `browser` | bundled browser plugin with in-app browser control skill, docs, scripts, assets | `plugins/browser` | Cache copied/adapted | Source `openai-bundled/browser/26.616.81150`. |
| `chrome` | bundled Chrome plugin with extension host, scripts, docs, assets | `plugins/chrome` | Cache copied/adapted | Source `openai-bundled/chrome/26.616.81150`. |
| `computer-use` | bundled desktop observation/input plugin with scripts and assets | `plugins/computer-use` | Cache copied/adapted | Source `openai-bundled/computer-use/26.616.81150`. |
| `gmail` | remote connector plugin, app config, Gmail skills, references/assets | `plugins/gmail` | Cache copied/adapted | Source `openai-curated-remote/gmail/0.1.3`. |
| `google-calendar` | remote connector app plus calendar, daily brief, free-time, scheduler, meeting prep skills | `plugins/google-calendar` | Cache copied/adapted | Source `openai-curated-remote/google-calendar/1.2.3`. |
| `outlook-email` | remote connector plugin plus Outlook workflow skills | `plugins/outlook-email` | Cache copied/adapted | Source `openai-curated-remote/outlook-email/0.1.3`. |
| `superpowers` | engineering process plugin with many workflow skills | `plugins/superpowers` | Cache copied/adapted | Source `openai-curated-remote/superpowers/5.1.4`. |

## Adaptation

- `.codex-plugin/plugin.json` is moved to `.nexts-plugin/plugin.json`.
- `agents/openai.yaml` is moved to `agents/nextsai.yaml`.
- Platform references such as `Codex`, `codex`, `CODEX_HOME`, and `CODEX_CI` are rewritten to the Nexts equivalents.
- Upstream license, author, repository, scripts, docs, assets, and runtime helper files are otherwise preserved.

## Next Runtime Follow-Ups

1. Bind app connector IDs and MCP/tool names to the Nexts runtime.
2. Bind browser/chrome/computer-use scripts to Nexts host capability permissions.
3. Verify copied document runtime helper scripts against the Nexts packaged Python/Node environment.
