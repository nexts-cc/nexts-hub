# Development

This repository is the unified content hub for skills, plugins, assistants, and MCP servers. Root npm scripts are the supported entry points for creating content, refreshing category registries, and validating the hub.

## Scripts

```sh
npm run new:skill -- contract-helper
npm run new:plugin -- data-tools
npm run new:assistant -- research-helper
npm run new:mcp -- local-search
npm run sync-index
npm run validate
```

The scaffold commands create content from the matching category template, refresh all category `index.json` files, and print the created path. Content IDs must match `^[a-z][a-z0-9-_]*$`.

## Registries

Each category has a generated root registry:

- `skills/index.json`
- `plugins/index.json`
- `assistants/index.json`
- `mcp/index.json`

The `version` field in each category registry is maintained manually. Running `npm run sync-index` preserves the current version and regenerates only `items`. The top-level `index.json` is also maintained manually.

## Adding Content

1. Create the scaffold with the relevant `npm run new:* -- <id>` command.
2. Edit the generated content files.
3. Run `npm run sync-index` to refresh generated registries.
4. Manually bump the affected category registry `version` when the content change should be published.
5. Run `npm run validate`.
6. Commit the scaffold, edited files, generated registry updates, and any manual version bump together.
