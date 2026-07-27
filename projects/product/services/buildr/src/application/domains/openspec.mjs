import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';
import { applyDeterministicSyncPlan, createDeterministicSyncPlan, DETERMINISTIC_SYNC_PLAN_SCHEMA } from '../openspec/deterministic-sync.mjs';
import { portableExecutableIdentity } from '../openspec/convergence-model.mjs';
import { runOpenSpecConvergence } from '../openspec/openspec-converge.mjs';
import { validateActualOpenSpec, validateProjectedOpenSpec } from '../openspec/projected-validator.mjs';

const OPENSPEC_CONTRACT_BASELINE_SCHEMA = 'buildr.openspec-contract-baseline/v1';
const OPENSPEC_CONTRACT_RECEIPT_SCHEMA = 'buildr.openspec-contract-receipt/v1';
const OPENSPEC_CONTRACT_SUPPORTED_UPSTREAM_VERSIONS = new Set(['1.6.0']);

export function registerDomainsOpenspec(runtime) {
  const readProjectsRegistryIfExists = (...args) => runtime.readProjectsRegistryIfExists(...args);
  const usage = (...args) => runtime.usage(...args);
  const isPlainObject = (...args) => runtime.isPlainObject(...args);
  const assertNoUnknownOptions = (...args) => runtime.assertNoUnknownOptions(...args);
  const positionalArgs = (...args) => runtime.positionalArgs(...args);
  const runCommandsCheck = (...args) => runtime.runCommandsCheck(...args);
  const readComponentsManifestForWrite = (...args) => runtime.readComponentsManifestForWrite(...args);
  const readComponentDefinition = (...args) => runtime.readComponentDefinition(...args);
  const componentDefinitionFile = (...args) => runtime.componentDefinitionFile(...args);
  const assertName = (...args) => runtime.assertName(...args);
  const optionValue = (...args) => runtime.optionValue(...args);
  const atomicWriteJson = (...args) => runtime.atomicWriteJson(...args);
  const atomicWriteFile = (...args) => runtime.atomicWriteFile(...args);
  const ensureDirectory = (...args) => runtime.ensureDirectory(...args);
  const copyDirectory = (...args) => runtime.copyDirectory(...args);
  const removePath = (...args) => runtime.removePath(...args);
  const hasFlag = (...args) => runtime.hasFlag(...args);
  const toPosixRelative = (...args) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args) => runtime.existsDirectory(...args);
  const existsFile = (...args) => runtime.existsFile(...args);
  const assertInitializedBuildrWorkspace = (...args) => runtime.assertInitializedBuildrWorkspace(...args);

  function normalizeOpenSpecContractText(content) {
    return String(content).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');
  }

  function openSpecContractHash(value) {
    return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
  }

  function openSpecContractChangePath(projectRoot, change) {
    assertName(change, 'OpenSpec change');
    const changesRoot = path.join(projectRoot, 'openspec', 'changes');
    const changeRoot = path.join(changesRoot, change);
    if (!changeRoot.startsWith(`${changesRoot}${path.sep}`) || !existsDirectory(changeRoot)) {
      throw new Error(`Active OpenSpec change not found: ${change}`);
    }
    if (!existsFile(path.join(changeRoot, '.openspec.yaml'))) {
      throw new Error(`OpenSpec change is missing .openspec.yaml: ${change}`);
    }
    return changeRoot;
  }

  function openSpecConvergenceChangePath(projectRoot, change) {
    try { return { changeRoot: openSpecContractChangePath(projectRoot, change), archived: false }; }
    catch (activeError) {
      const archiveRoot = path.join(projectRoot, 'openspec', 'changes', 'archive');
      const matches = existsDirectory(archiveRoot)
        ? fs.readdirSync(archiveRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && entry.name.endsWith(`-${change}`) && existsFile(path.join(archiveRoot, entry.name, '.openspec.yaml')))
          .map((entry) => path.join(archiveRoot, entry.name))
        : [];
      if (matches.length !== 1) throw activeError;
      return { changeRoot: matches[0], archived: true };
    }
  }

  function resolveOpenSpecContractProject(targetRoot, project) {
    assertInitializedBuildrWorkspace(targetRoot);
    assertName(project, 'Project');
    const registry = readProjectsRegistryIfExists(targetRoot);
    if (!registry || !registry.projects?.[project]) throw new Error(`Project is not registered in projects/manifest.yml: ${project}`);
    const projectRoot = path.join(targetRoot, 'projects', project);
    if (!existsDirectory(projectRoot)) throw new Error(`Project directory is missing: projects/${project}`);
    const planningRoot = path.join(projectRoot, 'openspec');
    if (!existsDirectory(path.join(planningRoot, 'specs')) || !existsDirectory(path.join(planningRoot, 'changes'))) {
      throw new Error(`Project does not contain an initialized OpenSpec planning root: projects/${project}/openspec`);
    }
    return { projectRoot, planningRoot };
  }

  function openSpecContractComponent(targetRoot) {
    const registry = readComponentsManifestForWrite(targetRoot);
    const entry = registry.components.find((item) => item.id === 'openspec');
    if (!entry || entry.enabled === false || entry.state === 'uninstalled') {
      throw new Error('OpenSpec Component is not installed. Run buildr component install openspec --agent <agent> --target <workspace>.');
    }
    const definition = readComponentDefinition(componentDefinitionFile(targetRoot, entry), 'openspec');
    const upstreamVersion = definition.upstream?.version;
    if (!upstreamVersion || !OPENSPEC_CONTRACT_SUPPORTED_UPSTREAM_VERSIONS.has(upstreamVersion)) {
      throw new Error(`OpenSpec contract guard does not support upstream version ${upstreamVersion || '<missing>'}. Update Buildr/OpenSpec Component and rerun verification.`);
    }
    const commands = runCommandsCheck(targetRoot);
    const openspec = commands.commands.find((item) => item.id === 'openspec');
    if (!openspec || openspec.status !== 'ok' || openspec.version?.current !== upstreamVersion) {
      const actual = openspec?.version?.current || openspec?.status || '<missing>';
      throw new Error(`OpenSpec CLI does not satisfy Component upstream version ${upstreamVersion}: ${actual}. ${openspec?.installHint || 'Install the declared OpenSpec CLI version; Buildr does not install it automatically.'}`);
    }
    return { entry, definition, upstreamVersion };
  }

  function parseOpenSpecRequirementBlocks(content, label) {
    // OpenSpec strict validation owns Markdown and delta correctness. Buildr
    // only extracts identities and full blocks needed for baseline and receipt facts.
    const normalized = normalizeOpenSpecContractText(content);
    const matches = [...normalized.matchAll(/^### Requirement:\s*(.+?)\s*$/gm)];
    const requirements = new Map();
    for (let index = 0; index < matches.length; index += 1) {
      const title = matches[index][1].trim();
      if (!title) continue;
      const start = matches[index].index;
      const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
      requirements.set(title, normalizeOpenSpecContractText(normalized.slice(start, end)));
    }
    return requirements;
  }

  function validateUpstreamOpenSpecStrict(projectRoot, change) {
    const result = spawnSync('openspec', ['validate', change, '--strict', '--no-interactive'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    if (result.error) throw new Error('Unable to execute OpenSpec strict validation: ' + result.error.message);
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim();
      throw new Error('OpenSpec strict validation failed for ' + change + (detail ? ': ' + detail : ''));
    }
  }

  function openSpecSection(content, name) {
    const normalized = normalizeOpenSpecContractText(content);
    const header = new RegExp(`^## ${name}\\s*$`, 'm');
    const match = header.exec(normalized);
    if (!match) return '';
    const next = /^## /gm;
    next.lastIndex = match.index + match[0].length;
    const nextMatch = next.exec(normalized);
    return normalized.slice(match.index + match[0].length, nextMatch ? nextMatch.index : normalized.length);
  }

  function parseOpenSpecDeltaSpec(content, capability, label) {
    const operations = [];
    for (const [section, type] of [['ADDED Requirements', 'ADDED'], ['MODIFIED Requirements', 'MODIFIED'], ['REMOVED Requirements', 'REMOVED']]) {
      const requirements = parseOpenSpecRequirementBlocks(openSpecSection(content, section), `${label} ${section}`);
      for (const [title, requirement] of requirements) operations.push({ type, capability, title, requirement });
    }
    const renamed = openSpecSection(content, 'RENAMED Requirements');
    const renamePattern = /-\s*FROM:\s*`?### Requirement:\s*(.+?)`?\s*\n\s*-\s*TO:\s*`?### Requirement:\s*(.+?)`?\s*(?=\n|$)/g;
    for (const match of renamed.matchAll(renamePattern)) {
      const from = match[1].trim();
      const to = match[2].trim();
      if (from && to && from !== to) operations.push({ type: 'RENAMED', capability, from, to });
    }
    return operations;
  }

  function parseOpenSpecChangeDelta(changeRoot) {
    const specsRoot = path.join(changeRoot, 'specs');
    if (!existsDirectory(specsRoot)) return { capabilities: new Map(), operations: [], hash: openSpecContractHash('') };
    const capabilities = new Map();
    const operations = [];
    for (const entry of fs.readdirSync(specsRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory()) continue;
      assertName(entry.name, 'OpenSpec capability');
      const file = path.join(specsRoot, entry.name, 'spec.md');
      if (!existsFile(file)) throw new Error(`Delta spec is missing spec.md: specs/${entry.name}`);
      const content = normalizeOpenSpecContractText(fs.readFileSync(file, 'utf8'));
      const items = parseOpenSpecDeltaSpec(content, entry.name, `Delta specs/${entry.name}/spec.md`);
      if (items.length === 0) throw new Error(`Delta spec does not declare any Requirement operation: specs/${entry.name}/spec.md`);
      capabilities.set(entry.name, { file, content, operations: items });
      operations.push(...items);
    }
    return { capabilities, operations, hash: openSpecContractHash([...capabilities.values()].map((item) => `${item.file}\n${item.content}`).join('\n')) };
  }

  function readOpenSpecCanonicalRequirements(projectRoot, capability) {
    assertName(capability, 'OpenSpec capability');
    const file = path.join(projectRoot, 'openspec', 'specs', capability, 'spec.md');
    if (!existsFile(file)) return { file, requirements: new Map() };
    return { file, requirements: parseOpenSpecRequirementBlocks(fs.readFileSync(file, 'utf8'), `Canonical specs/${capability}/spec.md`) };
  }

  function parseOpenSpecProposalCapabilities(changeRoot) {
    const file = path.join(changeRoot, 'proposal.md');
    if (!existsFile(file)) throw new Error('OpenSpec proposal.md is missing.');
    const content = normalizeOpenSpecContractText(fs.readFileSync(file, 'utf8'));
    const result = { new: new Set(), modified: new Set(), descriptions: new Map() };
    for (const [heading, target] of [['New Capabilities', result.new], ['Modified Capabilities', result.modified]]) {
      const section = openSpecSection(content, `# ${heading}`).trim() || (() => {
        const match = new RegExp(`^### ${heading}\\s*$`, 'm').exec(content);
        if (!match) return '';
        const rest = content.slice(match.index + match[0].length);
        const next = /^### /m.exec(rest);
        return next ? rest.slice(0, next.index) : rest;
      })();
      for (const match of section.matchAll(/^-\s+`([A-Za-z0-9._-]+)`\s*:\s*(.+?)\s*$/gm)) {
        target.add(match[1]);
        result.descriptions.set(match[1], match[2].trim());
      }
    }
    return result;
  }

  function openSpecBaselinePath(changeRoot) {
    return path.join(changeRoot, '.buildr', 'contract-baseline.json');
  }

  function openSpecReceiptPath(changeRoot) {
    return path.join(changeRoot, '.buildr', 'contract-pre-sync-receipt.json');
  }

  function openSpecSyncPlanPath(changeRoot) {
    return path.join(changeRoot, '.buildr', 'deterministic-sync-plan.json');
  }

  function readOpenSpecContractJson(file, schema) {
    if (!existsFile(file)) return null;
    let value;
    try {
      value = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`OpenSpec contract sidecar is invalid JSON: ${toPosixRelative(process.cwd(), file)} (${error.message})`);
    }
    if (!isPlainObject(value) || value.schemaVersion !== schema) throw new Error(`OpenSpec contract sidecar has unsupported schema: ${toPosixRelative(process.cwd(), file)}`);
    return value;
  }

  function writeOpenSpecContractJson(file, value) {
    atomicWriteJson(file, value);
  }

  function baselineTargetsForDelta(projectRoot, delta) {
    const targets = [];
    for (const operation of delta.operations) {
      const canonical = readOpenSpecCanonicalRequirements(projectRoot, operation.capability).requirements;
      if (operation.type === 'RENAMED') {
        for (const [title, expectedState] of [[operation.from, 'present'], [operation.to, 'absent']]) {
          targets.push({ capability: operation.capability, title, operation: operation.type, state: expectedState, content: canonical.get(title) || null });
        }
      } else {
        const expectedState = operation.type === 'ADDED' ? 'absent' : 'present';
        targets.push({ capability: operation.capability, title: operation.title, operation: operation.type, state: expectedState, content: canonical.get(operation.title) || null });
      }
    }
    for (const target of targets) {
      if ((target.state === 'present') !== Boolean(target.content)) {
        throw new Error(`Canonical Requirement state does not match delta operation: ${target.capability} / ${target.title}`);
      }
    }
    return targets;
  }

  function expectedOpenSpecBaselineTargets(delta) {
    const targets = [];
    for (const operation of delta.operations) {
      if (operation.type === 'RENAMED') {
        targets.push({ capability: operation.capability, title: operation.from, operation: operation.type, state: 'present' });
        targets.push({ capability: operation.capability, title: operation.to, operation: operation.type, state: 'absent' });
      } else {
        targets.push({ capability: operation.capability, title: operation.title, operation: operation.type, state: operation.type === 'ADDED' ? 'absent' : 'present' });
      }
    }
    return targets;
  }

  function baselineTargetMap(baseline) {
    const targets = Array.isArray(baseline?.targets) ? baseline.targets : [];
    const result = new Map();
    for (const target of targets) {
      if (!isPlainObject(target) || typeof target.capability !== 'string' || typeof target.title !== 'string'
        || !['present', 'absent'].includes(target.state) || typeof target.operation !== 'string') {
        throw new Error('OpenSpec contract baseline contains an invalid target.');
      }
      const key = `${target.capability}\u0000${target.title}`;
      if (result.has(key)) throw new Error(`OpenSpec contract baseline contains duplicate target: ${target.capability} / ${target.title}`);
      if (target.state === 'present' && typeof target.content !== 'string') throw new Error(`OpenSpec contract baseline is missing content: ${target.capability} / ${target.title}`);
      if (target.state === 'absent' && target.content !== null) throw new Error(`OpenSpec contract baseline must record null content for absent Requirement: ${target.capability} / ${target.title}`);
      result.set(key, target);
    }
    return result;
  }

  function createOpenSpecContractResult(stage, change, project, upstreamVersion) {
    return {
      stage,
      change,
      project,
      upstreamVersion,
      baselineState: 'missing',
      conflicts: [],
      findings: [],
      ok: false,
      nextActions: [],
    };
  }

  function addOpenSpecContractFinding(result, severity, code, message, extra = {}) {
    result.findings.push({ severity, code, message, ...extra });
  }

  function finishOpenSpecContractResult(result) {
    result.ok = !result.findings.some((finding) => finding.severity === 'error');
    result.nextActions = [...new Map(result.findings
      .filter((finding) => finding.nextAction)
      .map((finding) => [finding.nextAction, finding.nextAction])).values()];
    return result;
  }

  function printOpenSpecContractResult(result) {
    console.log(`Buildr OpenSpec contract ${result.stage}: ${result.project}/${result.change}`);
    console.log(`Status: ${result.ok ? 'passed' : 'blocked'}; baseline=${result.baselineState}; conflicts=${result.conflicts.length}`);
    for (const finding of result.findings) {
      console.log(`[${finding.severity}] ${finding.code} - ${finding.message}`);
      if (finding.nextAction) console.log(`  下一步：${finding.nextAction}`);
      if (finding.expectedSummary || finding.actualSummary) console.log(`  预期/实际：${finding.expectedSummary ?? '<none>'} / ${finding.actualSummary ?? '<none>'}`);
    }
  }

  function validateOpenSpecProposalAlignment(projectRoot, changeRoot, delta, baseline, result) {
    let proposal;
    try {
      proposal = parseOpenSpecProposalCapabilities(changeRoot);
    } catch (error) {
      addOpenSpecContractFinding(result, 'error', 'openspec_contract.proposal_invalid', error.message, {
        nextAction: '修复 proposal.md 的 Capabilities 列表后重新运行 proposal check。',
      });
      return;
    }
    const deltaCapabilities = new Set(delta.capabilities.keys());
    for (const capability of deltaCapabilities) {
      if (!proposal.new.has(capability) && !proposal.modified.has(capability)) {
        addOpenSpecContractFinding(result, 'error', 'openspec_contract.proposal_delta_missing', `proposal 未声明 delta capability：${capability}`, {
          capability,
          nextAction: '在 proposal.md 的 Capabilities 中声明该 capability，或移除无关 delta spec。',
        });
      }
      const exists = existsFile(path.join(projectRoot, 'openspec', 'specs', capability, 'spec.md'));
      if (proposal.new.has(capability) && exists) addOpenSpecContractFinding(result, 'error', 'openspec_contract.proposal_kind_mismatch', `proposal 将已有 canonical capability 标为 new：${capability}`, { capability });
      if (proposal.modified.has(capability) && !exists) addOpenSpecContractFinding(result, 'error', 'openspec_contract.proposal_kind_mismatch', `proposal 将不存在的 canonical capability 标为 modified：${capability}`, { capability });
    }
    for (const capability of [...proposal.new, ...proposal.modified]) {
      if (!deltaCapabilities.has(capability)) addOpenSpecContractFinding(result, 'error', 'openspec_contract.proposal_delta_absent', `proposal capability 缺少 delta spec：${capability}`, {
        capability,
        nextAction: '创建对应 specs/<capability>/spec.md，或移除 proposal 中的 capability。',
      });
    }
    if (!baseline) return;
    let baselineTargets;
    try {
      baselineTargets = baselineTargetMap(baseline);
    } catch (error) {
      addOpenSpecContractFinding(result, 'error', 'openspec_contract.baseline_invalid', error.message, { nextAction: '使用 baseline create --update 显式重建基线。' });
      return;
    }
    const expected = expectedOpenSpecBaselineTargets(delta);
    const expectedMap = new Map(expected.map((target) => [`${target.capability}\u0000${target.title}`, target]));
    for (const [key, target] of expectedMap) {
      const actual = baselineTargets.get(key);
      if (!actual || actual.operation !== target.operation || actual.state !== target.state) {
        addOpenSpecContractFinding(result, 'error', 'openspec_contract.baseline_incomplete', `基线未覆盖当前 delta target：${target.capability} / ${target.title}`, {
          capability: target.capability,
          requirement: target.title,
          nextAction: '审阅当前 canonical facts 后运行 baseline create --update。',
        });
      }
    }
    for (const [key, target] of baselineTargets) {
      if (!expectedMap.has(key)) addOpenSpecContractFinding(result, 'error', 'openspec_contract.baseline_extra', `基线包含当前 delta 未触达的 target：${target.capability} / ${target.title}`, {
        capability: target.capability,
        requirement: target.title,
        nextAction: '审阅 delta 后运行 baseline create --update。',
      });
    }
    if (baseline.deltaHash !== delta.hash) addOpenSpecContractFinding(result, 'error', 'openspec_contract.baseline_delta_changed', 'delta 在创建基线后已变化。', {
      nextAction: '审阅变更范围后运行 baseline create --update。',
    });
  }

  function listActiveOpenSpecChangeRoots(projectRoot) {
    const root = path.join(projectRoot, 'openspec', 'changes');
    if (!existsDirectory(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && existsFile(path.join(root, entry.name, '.openspec.yaml')))
      .map((entry) => ({ id: entry.name, root: path.join(root, entry.name) }));
  }

  function openSpecDeltaIdentities(delta) {
    const identities = [];
    for (const operation of delta.operations) {
      const names = operation.type === 'RENAMED' ? [operation.from, operation.to] : [operation.title];
      for (const requirement of names) identities.push({ capability: operation.capability, requirement, operation: operation.type });
    }
    return identities;
  }

  function detectOpenSpecActiveConflicts(projectRoot, change, delta, result) {
    const current = new Set(openSpecDeltaIdentities(delta).map((item) => `${item.capability}\u0000${item.requirement}`));
    for (const candidate of listActiveOpenSpecChangeRoots(projectRoot)) {
      if (candidate.id === change) continue;
      let other;
      try {
        validateUpstreamOpenSpecStrict(projectRoot, candidate.id);
        other = parseOpenSpecChangeDelta(candidate.root);
      } catch (error) {
        addOpenSpecContractFinding(result, 'error', 'openspec_contract.active_change_invalid', `无法解析 active change ${candidate.id}：${error.message}`, {
          change: candidate.id,
          nextAction: '修复或归档无效 active change 后重新检查。',
        });
        continue;
      }
      for (const identity of openSpecDeltaIdentities(other)) {
        const key = `${identity.capability}\u0000${identity.requirement}`;
        if (!current.has(key)) continue;
        const conflict = { change: candidate.id, capability: identity.capability, requirement: identity.requirement };
        result.conflicts.push(conflict);
        addOpenSpecContractFinding(result, 'error', 'openspec_contract.active_conflict', `active changes 同时触达 Requirement：${identity.capability} / ${identity.requirement} (${candidate.id})`, {
          ...conflict,
          nextAction: '合并语义相同的 change，或先完成并重新建立后续 change 的基线。',
        });
      }
    }
  }

  function validateOpenSpecBaselineCurrent(projectRoot, baseline, result) {
    let targets;
    try {
      targets = baselineTargetMap(baseline);
    } catch (error) {
      addOpenSpecContractFinding(result, 'error', 'openspec_contract.baseline_invalid', error.message, { nextAction: '使用 baseline create --update 显式重建基线。' });
      return;
    }
    for (const target of targets.values()) {
      const actual = readOpenSpecCanonicalRequirements(projectRoot, target.capability).requirements.get(target.title) || null;
      const expected = target.content;
      if (actual !== expected) {
        result.baselineState = 'stale';
        addOpenSpecContractFinding(result, 'error', 'openspec_contract.baseline_stale', `canonical Requirement 已偏离基线：${target.capability} / ${target.title}`, {
          capability: target.capability,
          requirement: target.title,
          expectedState: target.state,
          expectedSummary: openSpecContractHash(expected || ''),
          actualSummary: openSpecContractHash(actual || ''),
          nextAction: '先恢复或审阅 canonical Requirement，再显式更新或重建该 change 的基线；不得将当前 canonical 自动采纳为同步结果。',
        });
      }
    }
  }

  function snapshotOpenSpecCapabilities(projectRoot, delta) {
    const capabilities = {};
    for (const capability of delta.capabilities.keys()) {
      const requirements = readOpenSpecCanonicalRequirements(projectRoot, capability).requirements;
      capabilities[capability] = Object.fromEntries([...requirements.entries()].sort(([left], [right]) => left.localeCompare(right)));
    }
    return capabilities;
  }

  function snapshotOpenSpecSpecIntegrities(projectRoot, delta) {
    const integrities = {};
    for (const capability of delta.capabilities.keys()) {
      const file = path.join(projectRoot, 'openspec', 'specs', capability, 'spec.md');
      const content = existsFile(file) ? normalizeOpenSpecContractText(fs.readFileSync(file, 'utf8')) : '';
      integrities[capability] = openSpecContractHash(content);
    }
    return integrities;
  }

  function renameRequirementBlock(content, from, to) {
    return normalizeOpenSpecContractText(content.replace(`### Requirement: ${from}`, `### Requirement: ${to}`));
  }

  function validateOpenSpecPostSync(projectRoot, delta, receipt, result) {
    if (receipt.deltaHash !== delta.hash) {
      addOpenSpecContractFinding(result, 'error', 'openspec_contract.receipt_delta_changed', 'delta 在 pre-sync 后发生变化。', {
        nextAction: '重新运行 pre-sync check 后再验证同步结果。',
      });
      return;
    }
    const touched = new Map();
    for (const operation of delta.operations) {
      const names = operation.type === 'RENAMED' ? [operation.from, operation.to] : [operation.title];
      for (const name of names) touched.set(`${operation.capability}\u0000${name}`, operation);
      const requirements = readOpenSpecCanonicalRequirements(projectRoot, operation.capability).requirements;
      if (operation.type === 'ADDED' || operation.type === 'MODIFIED') {
        const actual = requirements.get(operation.title) || null;
        if (actual !== operation.requirement) addOpenSpecContractFinding(result, 'error', 'openspec_contract.post_sync_result_mismatch', `同步结果不匹配 ${operation.type} Requirement：${operation.capability} / ${operation.title}`, {
          capability: operation.capability, requirement: operation.title, operation: operation.type,
          expectedSummary: openSpecContractHash(operation.requirement), actualSummary: openSpecContractHash(actual || ''),
          nextAction: '从 delta 中该 Requirement 的完整文本重建 canonical 后重跑 post-sync；不得重跑 pre-sync 掩盖 mismatch。',
        });
      } else if (operation.type === 'REMOVED') {
        if (requirements.has(operation.title)) addOpenSpecContractFinding(result, 'error', 'openspec_contract.post_sync_result_mismatch', `同步结果仍保留 REMOVED Requirement：${operation.capability} / ${operation.title}`, { capability: operation.capability, requirement: operation.title, operation: operation.type, expectedSummary: '<absent>', actualSummary: openSpecContractHash(requirements.get(operation.title)), nextAction: '移除 delta 声明的 Requirement 后重跑 post-sync。' });
      } else if (operation.type === 'RENAMED') {
        const before = receipt.capabilities?.[operation.capability]?.[operation.from];
        const expected = before ? renameRequirementBlock(before, operation.from, operation.to) : null;
        if (requirements.has(operation.from) || !expected || requirements.get(operation.to) !== expected) addOpenSpecContractFinding(result, 'error', 'openspec_contract.post_sync_rename_mismatch', `同步结果不匹配 RENAMED Requirement：${operation.capability} / ${operation.from} -> ${operation.to}`, { capability: operation.capability, requirement: operation.from });
      }
    }
    for (const [capability, snapshot] of Object.entries(receipt.capabilities || {})) {
      const current = readOpenSpecCanonicalRequirements(projectRoot, capability).requirements;
      const names = new Set([...Object.keys(snapshot), ...current.keys()]);
      for (const name of names) {
        if (touched.has(`${capability}\u0000${name}`)) continue;
        if ((snapshot[name] || null) !== (current.get(name) || null)) addOpenSpecContractFinding(result, 'error', 'openspec_contract.post_sync_untouched_changed', `同步修改了未触达 Requirement：${capability} / ${name}`, { capability, requirement: name });
      }
    }
  }

  function openSpecContractContext(args, options = {}) {
    const allowed = new Set(['--target', '--project', '--json', '--adopt-current', '--update', '--stage']);
    for (const option of options.allowedOptions || []) allowed.add(option);
    assertNoUnknownOptions(args, allowed, new Set(['--json', '--adopt-current', '--update']));
    const positionals = positionalArgs(args);
    const change = positionals[0];
    if (!change || positionals.length !== 1) throw new Error(`Usage: ${options.usage}`);
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const project = optionValue(args, '--project');
    const { projectRoot } = resolveOpenSpecContractProject(targetRoot, project);
    const component = openSpecContractComponent(targetRoot);
    const resolvedChange = options.allowArchived ? openSpecConvergenceChangePath(projectRoot, change) : { changeRoot: openSpecContractChangePath(projectRoot, change), archived: false };
    const { changeRoot, archived } = resolvedChange;
    if (!archived) validateUpstreamOpenSpecStrict(projectRoot, change);
    const delta = parseOpenSpecChangeDelta(changeRoot);
    if (delta.operations.length === 0) throw new Error(`OpenSpec change has no delta Requirements: ${change}`);
    return { targetRoot, project, projectRoot, component, change, changeRoot, delta, archived };
  }

  function openspecBaselineCreate(args) {
    const context = openSpecContractContext(args, {
      usage: 'buildr openspec baseline create <change> --project <project> [--target <dir>] [--adopt-current] [--update] [--json]',
    });
    const json = hasFlag(args, '--json');
    const baselineFile = openSpecBaselinePath(context.changeRoot);
    if (existsFile(baselineFile) && !hasFlag(args, '--update')) {
      throw new Error(`OpenSpec contract baseline already exists: ${toPosixRelative(context.projectRoot, baselineFile)}. Use --update only after reviewing the canonical facts.`);
    }
    const targets = baselineTargetsForDelta(context.projectRoot, context.delta);
    const baseline = {
      schemaVersion: OPENSPEC_CONTRACT_BASELINE_SCHEMA,
      change: context.change,
      project: context.project,
      upstreamVersion: context.component.upstreamVersion,
      deltaHash: context.delta.hash,
      adopted: hasFlag(args, '--adopt-current'),
      targets,
    };
    writeOpenSpecContractJson(baselineFile, baseline);
    const payload = {
      ok: true,
      change: context.change,
      project: context.project,
      upstreamVersion: context.component.upstreamVersion,
      baselinePath: toPosixRelative(context.projectRoot, baselineFile),
      adopted: baseline.adopted,
      targetCount: targets.length,
      nextActions: [`buildr openspec check ${context.change} --stage proposal --project ${context.project} --target ${context.targetRoot} --json`],
    };
    if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecBaseline, payload), null, 2)}\n`);
    else console.log(`Created OpenSpec contract baseline: ${payload.baselinePath} (${targets.length} targets)`);
  }

  function openspecCheck(args) {
    const context = openSpecContractContext(args, {
      usage: 'buildr openspec check <change> --stage <proposal|pre-sync|post-sync> --project <project> [--target <dir>] [--json]',
    });
    const stage = optionValue(args, '--stage');
    if (!['proposal', 'pre-sync', 'post-sync'].includes(stage)) throw new Error(`Unsupported OpenSpec contract stage: ${stage || '<missing>'}`);
    const json = hasFlag(args, '--json');
    const result = createOpenSpecContractResult(stage, context.change, context.project, context.component.upstreamVersion);
    const baselineFile = openSpecBaselinePath(context.changeRoot);
    let baseline;
    try {
      baseline = readOpenSpecContractJson(baselineFile, OPENSPEC_CONTRACT_BASELINE_SCHEMA);
    } catch (error) {
      addOpenSpecContractFinding(result, 'error', 'openspec_contract.baseline_invalid', error.message, { nextAction: `buildr openspec baseline create ${context.change} --project ${context.project} --target ${context.targetRoot}` });
    }
    if (!baseline) {
      addOpenSpecContractFinding(result, 'error', 'openspec_contract.baseline_missing', 'OpenSpec change 缺少契约基线。', { nextAction: `buildr openspec baseline create ${context.change} --project ${context.project} --target ${context.targetRoot}` });
    } else if (baseline.change !== context.change || baseline.project !== context.project || baseline.upstreamVersion !== context.component.upstreamVersion) {
      result.baselineState = 'stale';
      addOpenSpecContractFinding(result, 'error', 'openspec_contract.baseline_metadata_mismatch', '契约基线的 change、Project 或 upstream version 与当前事实不一致。', { nextAction: `审阅后运行 buildr openspec baseline create ${context.change} --project ${context.project} --target ${context.targetRoot} --update` });
    } else {
      result.baselineState = 'recorded';
    }

    if (stage === 'proposal') {
      validateOpenSpecProposalAlignment(context.projectRoot, context.changeRoot, context.delta, baseline, result);
      if (!result.findings.some((finding) => finding.severity === 'error') && baseline) result.baselineState = 'current';
    }

    if (stage === 'pre-sync') {
      validateOpenSpecProposalAlignment(context.projectRoot, context.changeRoot, context.delta, baseline, result);
      detectOpenSpecActiveConflicts(context.projectRoot, context.change, context.delta, result);
      if (baseline) validateOpenSpecBaselineCurrent(context.projectRoot, baseline, result);
      if (!result.findings.some((finding) => finding.severity === 'error')) {
        const receipt = {
          schemaVersion: OPENSPEC_CONTRACT_RECEIPT_SCHEMA,
          change: context.change,
          project: context.project,
          upstreamVersion: context.component.upstreamVersion,
          deltaHash: context.delta.hash,
          baselineHash: openSpecContractHash(baseline),
          capabilities: snapshotOpenSpecCapabilities(context.projectRoot, context.delta),
        };
        writeOpenSpecContractJson(openSpecReceiptPath(context.changeRoot), receipt);
        result.baselineState = 'current';
      }
    }

    if (stage === 'post-sync') {
      const receiptFile = openSpecReceiptPath(context.changeRoot);
      let receipt;
      try {
        receipt = readOpenSpecContractJson(receiptFile, OPENSPEC_CONTRACT_RECEIPT_SCHEMA);
      } catch (error) {
        addOpenSpecContractFinding(result, 'error', 'openspec_contract.receipt_invalid', error.message, { nextAction: '重新运行 pre-sync check 后再验证同步结果。' });
      }
      if (!receipt) addOpenSpecContractFinding(result, 'error', 'openspec_contract.receipt_missing', '缺少成功 pre-sync 的 contract receipt。', { nextAction: '重新运行 pre-sync check 后再执行或验证同步。' });
      else if (receipt.change !== context.change || receipt.project !== context.project || receipt.upstreamVersion !== context.component.upstreamVersion) addOpenSpecContractFinding(result, 'error', 'openspec_contract.receipt_metadata_mismatch', 'pre-sync receipt 与当前 change、Project 或 upstream version 不一致。', { nextAction: '重新运行 pre-sync check。' });
      else validateOpenSpecPostSync(context.projectRoot, context.delta, receipt, result);
      if (!result.findings.some((finding) => finding.severity === 'error')) {
        result.baselineState = 'contract-applied';
        receipt.postSyncVerified = true;
        receipt.postSyncDeltaHash = context.delta.hash;
        receipt.postSyncSpecIntegrities = snapshotOpenSpecSpecIntegrities(context.projectRoot, context.delta);
        writeOpenSpecContractJson(receiptFile, receipt);
      }
    }

    finishOpenSpecContractResult(result);
    if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecCheck, result), null, 2)}\n`);
    else printOpenSpecContractResult(result);
    process.exitCode = result.ok ? 0 : 1;
  }

  function openspecSyncPlan(args) {
    const context = openSpecContractContext(args, {
      usage: 'buildr openspec sync-plan <change> --project <project> [--target <dir>] [--json]',
    });
    const baseline = readOpenSpecContractJson(openSpecBaselinePath(context.changeRoot), OPENSPEC_CONTRACT_BASELINE_SCHEMA);
    if (!baseline) throw new Error('OpenSpec contract baseline is required before deterministic sync planning.');
    const proposal = parseOpenSpecProposalCapabilities(context.changeRoot);
    const plan = createDeterministicSyncPlan({ ...context, baseline, capabilityPurposes: proposal.descriptions });
    writeOpenSpecContractJson(openSpecSyncPlanPath(context.changeRoot), plan);
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecSyncPlan, {
      change: plan.change, project: plan.project, deltaHash: plan.deltaHash, status: plan.status,
      identity: plan.identity, operations: plan.operations, blocked: plan.blocked,
      files: plan.files.map((item) => ({ path: item.path, beforeDigest: item.beforeDigest, expectedDigest: item.expectedDigest })),
      planPath: toPosixRelative(context.projectRoot, openSpecSyncPlanPath(context.changeRoot)),
      fallback: plan.status === 'blocked' ? { action: 'agent-driven-sync', reason: 'semantic-resolution-required' } : null,
    });
    if (hasFlag(args, '--json')) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else console.log(`OpenSpec deterministic sync plan: ${plan.status} (${plan.operations.length} operations)`);
    process.exitCode = plan.status === 'blocked' ? 2 : 0;
  }

  function openspecSyncApply(args) {
    const context = openSpecContractContext(args, {
      usage: 'buildr openspec sync-apply <change> --project <project> [--target <dir>] [--json]',
      allowedOptions: ['--openspec-executable'],
    });
    const plan = readOpenSpecContractJson(openSpecSyncPlanPath(context.changeRoot), DETERMINISTIC_SYNC_PLAN_SCHEMA);
    if (!plan) throw new Error('OpenSpec deterministic sync plan receipt is missing. Run openspec sync-plan first.');
    if (plan.change !== context.change || plan.project !== context.project || plan.deltaHash !== context.delta.hash) throw new Error('OpenSpec deterministic sync plan receipt no longer matches the change.');
    const result = applyDeterministicSyncPlan({ projectRoot: context.projectRoot, plan, validateExpected: ({ files }) => {
      const startedAt = Date.now();
      const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-expected-'));
      try {
        const temporaryProject = path.join(temporaryRoot, 'project');
        ensureDirectory(temporaryProject);
        copyDirectory(path.join(context.projectRoot, 'openspec'), path.join(temporaryProject, 'openspec'));
        for (const item of files) {
          const target = path.join(temporaryProject, item.path);
          atomicWriteFile(target, item.content);
        }
        const declaredExecutable = optionValue(args, '--openspec-executable');
        const executableLookup = declaredExecutable ? null : spawnSync('which', ['openspec'], { encoding: 'utf8' });
        const executable = declaredExecutable || (executableLookup.status === 0 ? executableLookup.stdout.trim() : '');
        if (!path.isAbsolute(executable) || !existsFile(executable)) return { status: 'blocked', code: 'openspec-executable-unavailable', durationMs: Date.now() - startedAt };
        const version = spawnSync(executable, ['--version'], { cwd: temporaryProject, encoding: 'utf8' });
        const validation = spawnSync(executable, ['validate', '--all', '--strict', '--no-interactive'], { cwd: temporaryProject, encoding: 'utf8' });
        const output = `${validation.stdout || ''}${validation.stderr || ''}`;
        return {
          status: validation.status === 0 ? 'passed' : 'blocked',
          code: validation.status === 0 ? null : 'expected-tree-strict-validation-failed',
          executable,
          version: version.status === 0 ? version.stdout.trim() : null,
          durationMs: Date.now() - startedAt,
          expectedDigests: Object.fromEntries(files.map((item) => [item.path, item.digest])),
          diagnostic: { bytes: Buffer.byteLength(output), sha256: openSpecContractHash(output), preview: output.slice(0, 2000), truncated: output.length > 2000 },
        };
      } finally { removePath(temporaryRoot); }
    } });
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecSyncApply, { change: context.change, project: context.project, ...result });
    if (hasFlag(args, '--json')) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else console.log(`OpenSpec deterministic sync apply: ${result.status} (${result.effects.length} effects)`);
    process.exitCode = result.status === 'passed' ? 0 : 2;
  }

  function openspecConverge(args) {
    const context = openSpecContractContext(args, {
      usage: 'buildr openspec converge <change> --project <project> [--target <dir>] [--json]',
      allowArchived: true,
    });
    const executableLookup = spawnSync('which', ['openspec'], { encoding: 'utf8' });
    const openspecExecutable = executableLookup.status === 0 ? executableLookup.stdout.trim() : '';
    if (!path.isAbsolute(openspecExecutable) || !existsFile(openspecExecutable)) throw new Error('Unable to resolve the declared OpenSpec executable for convergence.');
    const openspecVersionResult = spawnSync(openspecExecutable, ['--version'], { cwd: context.projectRoot, encoding: 'utf8' });
    const executableIdentity = portableExecutableIdentity({
      projectRoot: context.projectRoot,
      executable: openspecExecutable,
      version: openspecVersionResult.status === 0 ? openspecVersionResult.stdout.trim() : null,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(openspecExecutable)).digest('hex'),
    });
    const proposal = parseOpenSpecProposalCapabilities(context.changeRoot);
    const conflictResult = createOpenSpecContractResult('converge', context.change, context.project, context.component.upstreamVersion);
    if (!context.archived) detectOpenSpecActiveConflicts(context.projectRoot, context.change, context.delta, conflictResult);
    const activeConflicts = [
      ...conflictResult.conflicts.map((item) => ({ ...item, code: 'active-change-conflict' })),
      ...conflictResult.findings.filter((item) => item.severity === 'error' && item.code !== 'openspec_contract.active_conflict')
        .map((item) => ({ change: item.change || null, capability: item.capability || null, requirement: item.requirement || null, code: item.code, message: item.message })),
    ];
    const resolveArchivedChangeRoot = () => {
      const resolved = openSpecConvergenceChangePath(context.projectRoot, context.change);
      if (!resolved.archived) throw new Error('OpenSpec archive command did not move the Change.');
      return resolved.changeRoot;
    };
    const convergence = runOpenSpecConvergence({
      context,
      executable: openspecExecutable,
      executableIdentity,
      capabilityPurposes: proposal.descriptions,
      activeConflicts,
      validateProjected: ({ files }) => validateProjectedOpenSpec({ projectRoot: context.projectRoot, files, executable: openspecExecutable, copyDirectory, atomicWriteFile, removePath }),
      validateActual: () => validateActualOpenSpec({ projectRoot: context.projectRoot, executable: openspecExecutable }),
      archive: () => {
        const startedAt = Date.now();
        const archived = spawnSync(openspecExecutable, ['archive', context.change, '--yes', '--skip-specs'], { cwd: context.projectRoot, encoding: 'utf8' });
        return { status: archived.status === 0 ? 'passed' : 'blocked', code: archived.status === 0 ? null : 'archive-failed', exitCode: archived.status, durationMs: Date.now() - startedAt, commandCount: 1, diagnostic: (archived.stderr || archived.stdout || '').slice(0, 2000) };
      },
      resolveArchivedChangeRoot,
      writeReceipt: writeOpenSpecContractJson,
    });
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecConverge, convergence);
    if (hasFlag(args, '--json')) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else console.log(`OpenSpec convergence: ${payload.status} (${payload.durationMs}ms)`);
    process.exitCode = payload.status === 'passed' ? 0 : 2;
  }

  Object.assign(runtime, { normalizeOpenSpecContractText, openSpecContractHash, openSpecContractChangePath, resolveOpenSpecContractProject, openSpecContractComponent, parseOpenSpecRequirementBlocks, openSpecSection, parseOpenSpecDeltaSpec, parseOpenSpecChangeDelta, readOpenSpecCanonicalRequirements, parseOpenSpecProposalCapabilities, openSpecBaselinePath, openSpecReceiptPath, openSpecSyncPlanPath, readOpenSpecContractJson, writeOpenSpecContractJson, baselineTargetsForDelta, expectedOpenSpecBaselineTargets, baselineTargetMap, createOpenSpecContractResult, addOpenSpecContractFinding, finishOpenSpecContractResult, printOpenSpecContractResult, validateOpenSpecProposalAlignment, listActiveOpenSpecChangeRoots, openSpecDeltaIdentities, detectOpenSpecActiveConflicts, validateOpenSpecBaselineCurrent, snapshotOpenSpecCapabilities, snapshotOpenSpecSpecIntegrities, renameRequirementBlock, validateOpenSpecPostSync, openSpecContractContext, openspecBaselineCreate, openspecCheck, openspecSyncPlan, openspecSyncApply, openspecConverge });
  return runtime;
}
