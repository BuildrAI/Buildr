#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function markdownRequirements(source, section = null) {
  const lines = source.split(/\r?\n/);
  const requirements = [];
  let currentSection = null;
  let current = null;
  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.+?)\s*$/);
    if (sectionMatch) { currentSection = sectionMatch[1]; current = null; continue; }
    const requirementMatch = line.match(/^### Requirement:\s*(.+?)\s*$/);
    if (requirementMatch) {
      current = { name: requirementMatch[1], scenarios: [] };
      if (!section || currentSection === section) requirements.push(current);
      continue;
    }
    const scenarioMatch = line.match(/^#### Scenario:\s*(.+?)\s*$/);
    if (scenarioMatch && current && (!section || currentSection === section)) current.scenarios.push(scenarioMatch[1]);
  }
  return requirements;
}

export function scanDeltaCompatibility({ sourceRoot, change, io = fs }) {
  const deltaRoot = path.join(sourceRoot, 'changes', change, 'specs');
  if (!io.existsSync(deltaRoot)) return [];
  const findings = [];
  for (const capability of io.readdirSync(deltaRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
    const deltaPath = path.join(deltaRoot, capability, 'spec.md');
    const canonicalPath = path.join(sourceRoot, 'specs', capability, 'spec.md');
    if (!io.existsSync(deltaPath)) continue;
    const modified = markdownRequirements(io.readFileSync(deltaPath, 'utf8'), 'MODIFIED Requirements');
    const canonical = io.existsSync(canonicalPath) ? markdownRequirements(io.readFileSync(canonicalPath, 'utf8')) : [];
    for (const requirement of modified) {
      const existing = canonical.find((candidate) => candidate.name === requirement.name);
      if (!existing) {
        findings.push({ code: 'modified-requirement-missing', capability, requirement: requirement.name, deltaPath, canonicalPath });
        continue;
      }
      const missingScenarios = existing.scenarios.filter((scenario) => !requirement.scenarios.includes(scenario));
      if (missingScenarios.length) findings.push({ code: 'modified-scenarios-omitted', capability, requirement: requirement.name, missingScenarios, deltaPath, canonicalPath });
    }
  }
  return findings;
}

function directoryDigest(root, io = fs) {
  if (!io.existsSync(root)) return sha256('missing');
  const entries = [];
  const visit = (directory) => {
    for (const entry of io.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else entries.push(`${path.relative(root, file)}\0${io.readFileSync(file)}`);
    }
  };
  visit(root);
  return sha256(entries.join('\0'));
}

export function advanceConvergenceReceipt({ receipt, sourceRoot, stage, outcome = 'passed', io = fs }) {
  if (receipt?.schemaVersion !== 'buildr.openspec-convergence-receipt/v1') throw new Error('A valid convergence receipt is required.');
  if (outcome !== 'passed') throw new Error(`Convergence stage ${stage} did not pass.`);
  const allowed = { rehearsed: 'pre-sync', 'pre-sync': 'canonical-sync', 'canonical-sync': 'post-sync' };
  if (allowed[receipt.stage] !== stage) throw new Error(`Invalid convergence transition: ${receipt.stage} -> ${stage}.`);
  const deltaDigest = directoryDigest(path.join(sourceRoot, 'changes', receipt.change, 'specs'), io);
  if (deltaDigest !== receipt.deltaDigest) throw new Error('Convergence receipt is stale: delta digest changed.');
  const canonicalDigest = directoryDigest(path.join(sourceRoot, 'specs'), io);
  if (stage === 'pre-sync' && canonicalDigest !== receipt.canonicalDigest) throw new Error('Convergence receipt is stale: canonical facts changed before pre-sync.');
  if (stage === 'post-sync' && canonicalDigest !== receipt.postSyncCanonicalDigest) throw new Error('Convergence receipt is stale: canonical facts changed after canonical sync.');
  return {
    ...receipt,
    stage,
    ...(stage === 'canonical-sync' ? { postSyncCanonicalDigest: canonicalDigest } : {}),
    transitions: [...(receipt.transitions || []), { stage, outcome }],
  };
}

export function rehearseArchive({ projectRoot, change, openspecCommand = 'openspec', owner = `pid-${process.pid}`, io = fs, runCommand = spawnSync }) {
  const sourceRoot = path.resolve(projectRoot, 'openspec');
  const changeRoot = path.join(sourceRoot, 'changes', change);
  if (!io.existsSync(changeRoot)) throw new Error(`active Change not found: ${changeRoot}`);
  if (!io.existsSync(path.join(changeRoot, 'specs'))) {
    return { schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: 'not-applicable', change, owner, reason: 'change-has-no-delta-specs', cleanupStatus: 'not-applicable' };
  }
  if (!path.isAbsolute(openspecCommand) || !io.existsSync(openspecCommand)) {
    return {
      schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: 'failed', change, owner,
      error: 'OpenSpec executable 必须在复制 planning root 前解析为存在的绝对路径。',
      nextAction: '解析当前 Project 的 OpenSpec executable 绝对路径后重试 rehearsal。', cleanupStatus: 'not-applicable',
    };
  }
  const compatibilityFindings = scanDeltaCompatibility({ sourceRoot, change, io });
  if (compatibilityFindings.length) {
    return {
      schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: 'failed', change, owner,
      error: 'OpenSpec delta compatibility scan failed.', compatibilityFindings,
      nextAction: '一次性修正全部列出的 MODIFIED Requirement/Scenario 问题后重试 rehearsal。', cleanupStatus: 'not-applicable',
    };
  }

  const temporaryRoot = io.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-archive-rehearsal-'));
  const isolatedProject = path.join(temporaryRoot, 'project');
  let result = { schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: 'failed', change, owner, temporaryRoot };
  try {
    io.mkdirSync(isolatedProject, { recursive: true });
    io.cpSync(sourceRoot, path.join(isolatedProject, 'openspec'), { recursive: true, errorOnExist: true });
    const version = runCommand(openspecCommand, ['--version'], { encoding: 'utf8' });
    const archive = runCommand(openspecCommand, ['archive', change, '--yes'], { cwd: isolatedProject, encoding: 'utf8' });
    result = {
      schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: archive.status === 0 ? 'passed' : 'failed', change, owner,
      openspecVersion: version.status === 0 ? version.stdout.trim() : 'unknown', exitCode: archive.status,
      stdout: archive.stdout.trim(), stderr: archive.stderr.trim(), temporaryRoot,
      compatibilityFindings,
      convergenceReceipt: archive.status === 0 ? {
        schemaVersion: 'buildr.openspec-convergence-receipt/v1',
        change,
        deltaDigest: directoryDigest(path.join(changeRoot, 'specs'), io),
        canonicalDigest: directoryDigest(path.join(sourceRoot, 'specs'), io),
        openspecExecutable: openspecCommand,
        openspecVersion: version.status === 0 ? version.stdout.trim() : 'unknown',
        stage: 'rehearsed',
        transitions: [{ stage: 'rehearsed', outcome: 'passed' }],
        sequence: ['compatibility-scan', 'archive-rehearsal', 'pre-sync', 'canonical-sync', 'post-sync'],
      } : null,
    };
  } finally {
    try {
      io.rmSync(temporaryRoot, { recursive: true, force: true });
      result.cleanupStatus = 'cleaned';
    } catch (error) {
      result.cleanupStatus = 'retained';
      result.cleanupError = error.message;
    }
  }
  return result;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) values[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  if (!values['project-root'] || !values.change) throw new Error('usage: archive-rehearsal.mjs --project-root <path> --change <id> --openspec <absolute-path> [--owner <id>]');
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = rehearseArchive({ projectRoot: args['project-root'], change: args.change, openspecCommand: args.openspec, owner: args.owner });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'failed' || result.cleanupStatus === 'retained') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: 'failed', error: error.message }, null, 2));
    process.exitCode = 1;
  }
}
