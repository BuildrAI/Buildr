#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRuntimeAdapter, runtimeAdapterImplementationMatrix } from '../../../src/agent-assets/infrastructure/runtime/adapter-contract.mjs';
import { parseSkillsManifest } from '../../../src/agent-assets/infrastructure/runtime/skills/manifests.mjs';
import {
  enumerateSkillSourceFiles,
  parseSkillProjectionReceipt,
  runtimeFileMatches,
  sha256Integrity,
  skillProjectionOwnershipReceiptTarget,
} from '../../../src/agent-assets/infrastructure/runtime/skills/projection-files.mjs';
import { mapLimit, RuntimeVerificationHarness } from './fixture.mjs';

const PACKAGE_SKILLS_ROOT = 'resources/workspace/skills';
const harness = new RuntimeVerificationHarness();

function sourceInventory(sourceRoot) {
  return enumerateSkillSourceFiles(sourceRoot).map((file) => ({
    path: file.relativePath,
    integrity: sha256Integrity(file.content),
    executable: file.executable,
  })).sort((left, right) => left.path.localeCompare(right.path));
}

function changedPaths() {
  const raw = process.env.BUILDR_CHANGED_PATHS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function selectSkills(skills) {
  const paths = changedPaths();
  if (paths.length === 0 || paths.includes(`${PACKAGE_SKILLS_ROOT}/manifest.yml`)) return skills;
  const selected = skills.filter((skill) => paths.some((changedPath) => changedPath === `${PACKAGE_SKILLS_ROOT}/${skill.path}` || changedPath.startsWith(`${PACKAGE_SKILLS_ROOT}/${skill.path}/`)));
  return selected.length > 0 ? selected : skills;
}

function assertSkillProjection(workspace, adapterId, skill) {
  const adapter = getRuntimeAdapter(adapterId);
  const sourceRoot = path.join(workspace, 'skills', ...skill.path.split('/'));
  const runtimePath = skill.runtimePath || skill.id;
  const targetRoot = path.join(workspace, adapter.traits.skills.root, 'skills', ...runtimePath.split('/'));
  assert.ok(fs.existsSync(path.join(targetRoot, 'SKILL.md')), `${adapterId} must project ${skill.id}`);
  const inventory = sourceInventory(sourceRoot);
  const receiptFile = skillProjectionOwnershipReceiptTarget(workspace, 'workspace', adapterId, runtimePath);
  assert.ok(fs.existsSync(receiptFile), `${adapterId} must record a projection receipt for ${skill.id}`);
  const receipt = parseSkillProjectionReceipt(fs.readFileSync(receiptFile, 'utf8'));
  assert.equal(receipt.sourceDigest, sha256Integrity(Buffer.from(JSON.stringify(inventory), 'utf8')), `${adapterId} must bind ${skill.id} to the current source inventory`);
  assert.deepEqual(receipt.files.map((file) => file.path), inventory.map((file) => file.path), `${adapterId} must project the complete ${skill.id} inventory`);
  for (const file of receipt.files) {
    const target = path.join(targetRoot, ...file.path.split('/'));
    assert.equal(runtimeFileMatches(target, file.integrity, file.executable), true, `${adapterId} must match the recorded ${skill.id}/${file.path} projection`);
    if (file.path !== 'SKILL.md') {
      assert.deepEqual(fs.readFileSync(target), fs.readFileSync(path.join(sourceRoot, ...file.path.split('/'))), `${adapterId} must preserve ${skill.id}/${file.path} bytes`);
    }
  }
}

try {
  const seed = harness.initializeSeed('runtime-skill-projection', 'buildr-runtime-skill-projection-seed-');
  const skills = parseSkillsManifest(path.join(seed, 'skills', 'manifest.yml'))
    .filter((skill) => skill.enabled !== false && skill.state !== 'uninstalled' && typeof skill.path === 'string' && fs.existsSync(path.join(seed, 'skills', skill.path)));
  const selectedSkills = selectSkills(skills);
  assert.ok(selectedSkills.length > 0, 'runtime Skill projection must select at least one packaged Skill');

  const implementationMatrix = runtimeAdapterImplementationMatrix();
  const supportedAdapters = implementationMatrix.entries.map((entry) => entry.adapterId);
  await mapLimit(supportedAdapters, 3, async (adapterId) => {
    const workspace = harness.cloneWorkspace(seed, `buildr-runtime-skill-projection-${adapterId}-`);
    await harness.runAsync(['skills', 'render', adapterId, '--destination', 'workspace', '--target', workspace]);
    for (const skill of selectedSkills) {
      if (!Array.isArray(skill.runtimes) || skill.runtimes.includes(adapterId)) assertSkillProjection(workspace, adapterId, skill);
    }
  });

  console.log(`runtime Skill projection adapters: ${supportedAdapters.join(', ')}`);
  console.log(`runtime Skill projection skills: ${selectedSkills.map((skill) => skill.id).join(', ')}`);
  console.log(`runtime Skill projection command timings: ${harness.timingSummary()}`);
  console.log('runtime Skill projection verification passed');
} finally {
  harness.cleanup();
}
