#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const errors = [];

checkSkills("skills");

if (errors.length > 0) {
  console.error("Repository validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Repository validation passed.");

function checkSkills(relativePath) {
  const skillsRoot = join(root, relativePath);
  if (!existsSync(skillsRoot)) {
    errors.push(`${relativePath} is missing`);
    return;
  }

  for (const entry of readdirSync(skillsRoot)) {
    if (entry.startsWith(".") || ["mcp", "scripts"].includes(entry)) {
      continue;
    }
    const skillRoot = join(skillsRoot, entry);
    if (!statSync(skillRoot).isDirectory()) {
      continue;
    }

    const skillPath = join(skillRoot, "SKILL.md");
    if (!existsSync(skillPath)) {
      errors.push(`${relativePath}/${entry}/SKILL.md is missing`);
      continue;
    }

    const content = readFileSync(skillPath, "utf8")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n");
    if (!content.startsWith("---\n") || content.indexOf("\n---", 4) === -1) {
      errors.push(`${relativePath}/${entry}/SKILL.md must contain YAML frontmatter`);
    }
    if (!/^name:\s+[a-z0-9-]+$/m.test(content)) {
      errors.push(`${relativePath}/${entry}/SKILL.md frontmatter needs a kebab-case name`);
    }
    if (!/^description:\s+.+$/m.test(content)) {
      errors.push(`${relativePath}/${entry}/SKILL.md frontmatter needs a description`);
    }
  }
}
