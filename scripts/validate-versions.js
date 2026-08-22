#!/usr/bin/env node

"use strict";

const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");

const manifestPaths = [
  "plugin.json",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".agents/plugins/marketplace.json",
];

function readManifestVersion(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return manifest.version ?? manifest.plugins?.[0]?.version;
}

const pluginTags = execFileSync(
  "git",
  ["tag", "--list", "--sort=-version:refname"],
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean);
const expectedVersion = pluginTags.find((tag) => /^\d+\.\d+\.\d+$/.test(tag))
  ?? readManifestVersion("plugin.json");

if (!expectedVersion) {
  throw new Error("plugin.json has no version and no stable plugin release tag exists");
}

for (const manifestPath of manifestPaths) {
  const version = readManifestVersion(manifestPath);
  if (version !== expectedVersion) {
    throw new Error(
      `${manifestPath} has version ${version ?? "<missing>"}; expected ${expectedVersion}`,
    );
  }
}

console.log(`All plugin manifests use version ${expectedVersion}.`);
