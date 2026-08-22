#!/usr/bin/env node
/**
 * validate-reference-links.js
 *
 * Guards links from skills to shared reference checklists and Managed Pack
 * portability copies.
 *
 * The upstream whole-repository layout stores shared checklists in root
 * `references/`. Managed Pack resources instead need complete skill trees for
 * every target surface, so linked checklists are copied into the affected
 * skill and checked against the canonical root `assets/` resource.
 *
 * Nothing else in CI catches this: validate-artifact-paths.js is scoped to
 * spec/plan/todo artifacts and is explicitly not a general markdown linter.
 *
 * The rules enforced here are:
 *
 * 1. Every `references/*.md` link in a SKILL.md must resolve to an existing
 *    file relative to that skill's own directory.
 * 2. A colocated reference whose filename matches a Managed Pack asset must
 *    equal that declared asset byte for byte. Managed Pack skill resources are
 *    complete, portable trees, so these checked copies are the narrow exception
 *    to the repository's single shared-reference convention.
 *
 * Scope is deliberately narrow: only `references/*.md` links, only SKILL.md
 * files. It is not a general markdown path linter — skills legitimately
 * mention paths that do not exist yet (`tasks/todo.md`, `PERF.md`,
 * `docs/ideas/[idea-name].md`), and those must not fail the build.
 *
 * Exit codes: 0 = all clear, 1 = one or more unresolvable links.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'skills');

// Matches a link to a references/ markdown file, with any number of leading
// `../` segments: `references/x.md`, `../../references/x.md`. Anchored on a
// non-path character so `myreferences/x.md` does not match.
const REFERENCE_LINK_RE = /(?<![A-Za-z0-9._/-])((?:\.\.\/)*references\/[A-Za-z0-9._-]+\.md)/g;

function managedAssetSources() {
  const manifestPath = path.join(ROOT, 'pack.json');
  if (!fs.existsSync(manifestPath)) return new Map();

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const result = new Map();
  for (const resource of manifest.resources || []) {
    if (resource.kind !== 'asset' || typeof resource.source !== 'string') continue;
    result.set(path.basename(resource.source), resource.source);
  }
  return result;
}

function findViolations(skillDir, skillFile, assets) {
  const violations = [];
  const lines = fs.readFileSync(skillFile, 'utf8').split(/\r?\n/);

  lines.forEach((line, i) => {
    for (const match of line.matchAll(REFERENCE_LINK_RE)) {
      const link = match[1];
      const resolvedPath = path.resolve(skillDir, link);
      if (!fs.existsSync(resolvedPath)) {
        violations.push({ line: i + 1, link });
        continue;
      }

      if (!link.startsWith('references/')) continue;
      const assetSource = assets.get(path.basename(link));
      if (!assetSource) continue;
      const assetPath = path.join(ROOT, assetSource);
      if (!fs.existsSync(assetPath) || !fs.readFileSync(resolvedPath).equals(fs.readFileSync(assetPath))) {
        violations.push({
          line: i + 1,
          link,
          detail: `differs from managed Pack asset ${assetSource}`,
        });
      }
    }
  });

  return violations;
}

function main() {
  console.log('Checking references/ links in skills...\n');

  if (!fs.existsSync(SKILLS_DIR)) {
    console.log('No skills/ directory — nothing to check.');
    return;
  }

  let checked = 0;
  let errors = 0;
  let missingErrors = 0;
  let driftErrors = 0;
  const assets = managedAssetSources();

  const skillNames = fs.readdirSync(SKILLS_DIR).sort();
  for (const name of skillNames) {
    const skillDir = path.join(SKILLS_DIR, name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.statSync(skillDir).isDirectory() || !fs.existsSync(skillFile)) continue;

    checked++;
    const violations = findViolations(skillDir, skillFile, assets);

    if (violations.length === 0) {
      console.log(`  ✓  skills/${name}/SKILL.md`);
    } else {
      console.log(`  ✗  skills/${name}/SKILL.md`);
      for (const { line, link, detail } of violations) {
        const resolved = path.relative(ROOT, path.resolve(skillDir, link));
        const explanation = detail || `resolves to ${resolved}, which does not exist`;
        console.log(`       L${line}: ${link} — ${explanation}`);
        errors++;
        if (detail) {
          driftErrors++;
        } else {
          missingErrors++;
        }
      }
    }
  }

  const status = errors > 0 ? 'FAILED' : 'PASSED';
  console.log(`\n${checked} skills checked — ${errors} error(s) — ${status}`);

  if (errors > 0) {
    if (missingErrors > 0) {
      console.log('\nLinks to references/ are resolved from the skill\'s own directory.');
      console.log('Shared whole-repository checklists live in root references/, two levels up:');
      console.log('use `../../references/<file>.md`, or add a validated local Managed Pack portability copy.');
    }
    if (driftErrors > 0) {
      console.log('\nFor Managed Pack portability drift, keep the local `references/<file>.md` link and synchronize its bytes from the declared `assets/` resource.');
    }
    process.exit(1);
  }
}

main();
