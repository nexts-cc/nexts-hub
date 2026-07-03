# Site patterns

Reusable, per-domain browser knowledge lives here as `{domain}.md` (lowercase
hostname), e.g. `github.com.md`. This directory ships **inside the skill**, so
the agent (which reads `runtime/site-patterns/` relative to the skill) and the
native host (`native.sitePatterns`) resolve the same files whether the skill
runs from the repo, a release bundle, or an installed native host.

Record durable knowledge only: stable refs/selectors, reliable waits, login
walls, list/detail/search flows, CSP needs, extraction pitfalls. Never store
private user data, credentials, exact values, ids/tokens, or one-off notes.
