#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { afterEach, test } = require('node:test');

const VALIDATOR = path.join(__dirname, 'validate-managed-pack-closure.js');
const sandboxes = [];

function makeSandbox(requires) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skills-managed-pack-closure-test-'));
  const scriptsDir = path.join(root, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.copyFileSync(VALIDATOR, path.join(scriptsDir, 'validate-managed-pack-closure.js'));
  fs.writeFileSync(
    path.join(root, 'pack.json'),
    JSON.stringify({
      resources: [
        { kind: 'asset', id: 'guide', requires: [], bindings: [] },
        {
          kind: 'skill',
          id: 'workflow',
          requires,
          bindings: [{
            capabilities: [{
              type: 'claude-composite-skill',
              claude_composite_skill: {
                dependencies: [],
                references: [{ kind: 'asset', id: 'guide' }],
              },
            }],
          }],
        },
      ],
    }),
  );
  sandboxes.push(root);
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', 'validate-managed-pack-closure.js')], {
    cwd: root,
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts Claude composition resources inside the runtime closure', () => {
  const result = run(makeSandbox(['asset:guide']));

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Claude composition closure — PASSED/);
});

test('rejects a Claude reference outside the runtime closure', () => {
  const result = run(makeSandbox([]));

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /skill:workflow references asset:guide without declaring it in requires/);
});
