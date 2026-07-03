# Basic Plugin Template

Copy this folder to `plugins/<plugin-name>` and replace all `{{...}}` placeholders.

Required structure:

- `.nexts-plugin/plugin.json`
- optional `skills/<skill-name>/SKILL.md`
- optional `assets/`

When adding the plugin to the catalog, add an entry to `.agents/plugins/marketplace.json`:

```json
{
  "name": "plugin-name",
  "source": {
    "source": "local",
    "path": "./plugins/plugin-name"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```
