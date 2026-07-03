# Nexts Skills

Official Agent Skills catalog for NextsAI.

This repository defines the NextsAI skill catalog shape: skills live under `skills/`, and each skill is a self-contained directory with a required `SKILL.md`.

## Skills

- `contract-review` - Review contracts for risks and proposed revisions.
- `find-skills` - Discover and install agent skills.
- `meeting-minutes` - Turn notes or transcripts into structured meeting minutes.
- `resume-screen` - Score resumes against a job description.
- `skill-creator` - Create and maintain effective skills.

Plugin-bundled skills live in the plugins catalog under `plugins/<plugin-name>/skills/`; they are not duplicated here.

## Install

Install a single skill by pointing your agent to its GitHub directory, for example:

```text
$skill-installer install https://github.com/nexts-cc/skills/tree/main/skills/contract-review
```

Or clone the repository and copy a skill into your local skills directory:

```bash
git clone https://github.com/nexts-cc/skills.git
cd skills
cp -a skills/contract-review ~/.nexts/skills/
```

Restart the agent session after installing new skills.

## Develop

Create a new skill from the template:

```bash
cp -a templates/basic-skill skills/my-skill
```

Then update:

- `skills/my-skill/SKILL.md`
- `skills/my-skill/agents/nextsai.yaml`

Skill packages should keep this shape:

```text
skills/<name>/
  SKILL.md
  agents/nextsai.yaml
  references/
  scripts/
```

```bash
node scripts/validate-repo.mjs
```

## Plugin Skills

Codex-derived plugin skills are managed by the plugins repository. Install the related plugin instead of installing those skills directly from this standalone catalog.
