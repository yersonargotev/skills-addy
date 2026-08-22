"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const validator = path.join(__dirname, "validate-versions.js");

test("ignores Managed Pack release tags when validating plugin versions", (t) => {
  const repository = createRepository(t);
  git(repository, "tag", "0.6.7");
  tagManagedPack(repository);

  assert.doesNotThrow(() => {
    execFileSync(process.execPath, [validator], { cwd: repository, stdio: "pipe" });
  });
});

test("validates manifest consensus when no plugin release tag exists", (t) => {
  const repository = createRepository(t);
  tagManagedPack(repository);

  assert.doesNotThrow(() => {
    execFileSync(process.execPath, [validator], { cwd: repository, stdio: "pipe" });
  });
});

test("rejects divergent manifest versions without a plugin release tag", (t) => {
  const repository = createRepository(t, (root) => {
    writeJSON(root, ".agents/plugins/marketplace.json", { plugins: [{ version: "0.6.6" }] });
  });
  tagManagedPack(repository);

  assert.throws(() => {
    execFileSync(process.execPath, [validator], { cwd: repository, stdio: "pipe" });
  }, /marketplace\.json has version 0\.6\.6; expected 0\.6\.7/);
});

function createRepository(t, configure = () => {}) {
  const repository = mkdtempSync(path.join(tmpdir(), "validate-versions-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));

  writeManifests(repository, "0.6.7");
  configure(repository);
  git(repository, "init", "--quiet");
  git(repository, "add", ".");
  git(repository, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "managed project");

  return repository;
}

function tagManagedPack(repository) {
  writeFileSync(path.join(repository, "pack.json"), "{}\n");
  git(repository, "add", "pack.json");
  git(repository, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "managed pack");
  git(repository, "tag", "pack-v1.2.0");
}

function writeManifests(repository, version) {
  const simple = [
    "plugin.json",
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
  ];
  const marketplaces = [
    ".claude-plugin/marketplace.json",
    ".agents/plugins/marketplace.json",
  ];
  for (const manifest of simple) {
    writeJSON(repository, manifest, { version });
  }
  for (const manifest of marketplaces) {
    writeJSON(repository, manifest, { plugins: [{ version }] });
  }
}

function writeJSON(repository, relativePath, value) {
  const destination = path.join(repository, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(value)}\n`);
}

function git(repository, ...args) {
  execFileSync("git", args, { cwd: repository, stdio: "pipe" });
}
