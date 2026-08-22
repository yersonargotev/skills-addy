#!/usr/bin/env node
/**
 * Validate that every Claude composite dependency and reference is part of the
 * owning resource's Packy runtime closure.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'pack.json'), 'utf8'));
const violations = [];

for (const resource of manifest.resources || []) {
  const owner = `${resource.kind}:${resource.id}`;
  const requires = new Set(resource.requires || []);

  for (const binding of resource.bindings || []) {
    for (const capability of binding.capabilities || []) {
      if (capability.type !== 'claude-composite-skill') continue;

      const composition = capability.claude_composite_skill || {};
      for (const role of ['dependencies', 'references']) {
        for (const dependency of composition[role] || []) {
          const identity = `${dependency.kind}:${dependency.id}`;
          if (!requires.has(identity)) {
            violations.push(`${owner} ${role} ${identity} without declaring it in requires`);
          }
        }
      }
    }
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`ERROR: ${violation}`);
  console.error(`Claude composition closure — ${violations.length} error(s) — FAILED`);
  process.exit(1);
}

console.log('Claude composition closure — PASSED');
