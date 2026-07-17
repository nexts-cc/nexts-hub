# OpenConnector upstream provenance

The NEXTS connector runtime kernel is derived from selected parts of
`oomol-lab/open-connector` under Apache License 2.0.

- Repository: `https://github.com/oomol-lab/open-connector`
- Upstream tag: `v1.1.0`
- Upstream commit: `11e36e8706ab6c30a02d54727b7900e93c0347c9`
- Retrieved and reviewed: `2026-07-14`
- Local reference: `.nexts/references/open-connector` (ignored, development only)

NEXTS tracks the complete imported provider source and catalog under
`packages/nexts-connectors/provider-source`. Production builds and package
generation use that NEXTS-owned tree and never read the ignored reference
checkout. Provider definitions, Action schemas, and executors are emitted as
ordinary Connected Application packages and loaded only after local
installation.

Local modifications include the installed-only package registry, source-aware
installation receipts, package/file integrity checks, strict path containment,
NEXTS-owned authorization, and removal of hosted/public gateway surfaces.

Before changing the upstream tag or commit, update `UPSTREAM_LOCK.json`, the
license inventory, dependency review, package compatibility tests, and this
provenance record together.

Generate one reviewed provider package with explicit network permissions:

```bash
pnpm connector:package -- --service github --domain api.github.com --domain uploads.github.com
```

The generator bundles that provider's executors and Action schemas from the
NEXTS-owned imported source, records the source commit/build/license hashes, and
emits a deterministic package. The account-service admin upload validates the
exact bundle before publishing it to the official catalog; no per-package
signature is required. OAuth endpoint and
scope templates may be packaged without a client id; the desktop then reports
setup required and stores the user's client id and optional confidential secret
only in its local encrypted vault. A reviewed public client id requires
`--allow-public-oauth`; confidential client secrets are never packaged.
