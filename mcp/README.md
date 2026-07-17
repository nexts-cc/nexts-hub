# NEXTS MCP catalog and adapters

The MCP category contains launch definitions and the source for adapters maintained by NEXTS. It does not mirror packages maintained by third parties.

## Four distribution types

1. `official_npm`: an npm MCP package published by the official product/vendor. NEXTS stores its package specifier and runs it directly with `npx`.
2. `community_npm`: an npm MCP package published by an independent community maintainer. NEXTS stores its package specifier and identifies it as third-party.
3. `nexts_hub`: an adapter maintained by NEXTS. Its source lives under `mcp/_adapters`, and each service is built into its own versioned `.tgz` release asset.
4. `remote_mcp`: an HTTPS Streamable HTTP MCP endpoint. The client connects to the endpoint and does not install a local npm package.

## Layout

```text
mcp/
+-- _adapters/                 NEXTS-maintained adapter source (not a marketplace item)
|   +-- catalog/apps/          provider metadata and action schemas
|   +-- core/                  shared adapter contracts
|   `-- src/providers/         provider executors
+-- templates/basic-mcp/       manifest template
+-- <published-id>/mcp.json    optional curated Hub launch definition
`-- .agents/mcp/marketplace.json
```

Generated `.tgz` files and temporary build output are ignored. Publish them as GitHub Release assets rather than committing binaries.

## Build one NEXTS adapter

```bash
npm install
npm run build:mcp -- --service gmail --version 1.0.0
```

The command produces:

```text
dist/mcp/gmail/gmail-1.0.0.tgz
dist/mcp/gmail/catalog-release.json
```

Upload the `.tgz` to the release tag printed in `catalog-release.json`, then publish that HTTPS asset URL in `nexts-account-service`. Do not use `127.0.0.1`, `localhost`, a local filesystem path, or the account-service catalog-assets route for a production MCP release.

## Security and ownership

- Credentials and OAuth tokens are never committed to this repository.
- Account-service owns catalog state, OAuth coordination, visibility, recommendations, and the versioned launch definition.
- The desktop owns installed state and encrypted local credentials.
- Official/community packages remain owned by their original publishers; NEXTS must not silently repackage them.
