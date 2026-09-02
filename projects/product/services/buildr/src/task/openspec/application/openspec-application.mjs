import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { resolveSourceRoot } from '../../../workspace/domain/source-root.mjs';
import process from 'node:process';
import { spawnCommandSync } from '../../../infrastructure/process.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';
import { CONVERGENCE_RECEIPT_SCHEMA, portableExecutableIdentity } from './convergence-model.mjs';
import { canonicalSnapshots, convergenceReceiptPath, runOpenSpecConvergence } from './openspec-converge.mjs';
import { runOpenSpecConvergencePreflight } from './openspec-convergence-preflight.mjs';
import { observeConvergence } from './convergence-observer.mjs';
import { validateActualOpenSpec, validateProjectedOpenSpec } from './projected-validator.mjs';
import { normalizeOpenSpecContractText, openSpecSection, parseOpenSpecDeltaSpec, parseOpenSpecRequirementBlocks } from './delta-parser.mjs';

const OPENSPEC_CONTRACT_SUPPORTED_UPSTREAM_VERSIONS = new Set(['1.6.0']);

export function registerOpenSpecApplication(runtime, { projectQuery } = {}) {
  if (!projectQuery || typeof projectQuery.projectDetail !== 'function') {
    const error = new Error('OpenSpec Application requires the Project Query capability.');
    error.code = 'openspec_project_query_missing';
    throw error;
  }
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

  function openSpecContractHash(value) {
    return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
  }

  function openSpecContractChangePath(projectRoot, change) {
    assertName(change, 'OpenSpec change');
    const changesRoot = path.join(projectRoot, 'openspec', 'changes');
    const changeRoot = path.join(changesRoot, change);
    if (!changeRoot.startsWith(`${changesRoot}${path.sep}`) || !existsDirectory(changeRoot)) {
      const error = new Error(`Active OpenSpec change not found in the provided --target: ${change}.`);
      error.code = 'openspec.active_change_not_found';
      error.nextAction = '核对Change实际位于当前Workspace还是matching Worktree，并把该真实工作根原样作为--target重试；不得复制Change或自动搜索其他worktree。';
      throw error;
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
    let detail;
    try { detail = projectQuery.projectDetail(targetRoot, project); }
    catch (error) {
      if (error?.code === 'project_not_found') throw new Error(`Project is not registered in projects/manifest.yml: ${project}`, { cause: error });
      throw error;
    }
    const projectRoot = resolveSourceRoot(targetRoot, detail.project.source);
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
    if (!path.isAbsolute(openspec.executablePath || '') || !existsFile(openspec.executablePath)) {
      throw new Error('Unable to resolve the declared OpenSpec executable.');
    }
    return { entry, definition, upstreamVersion, executablePath: openspec.executablePath };
  }

  function validateUpstreamOpenSpecStrict(projectRoot, change, executable) {
    const result = spawnCommandSync(executable, ['validate', change, '--strict', '--no-interactive'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    if (result.error) throw new Error('Unable to execute OpenSpec strict validation: ' + result.error.message);
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim();
      throw new Error('OpenSpec strict validation failed for ' + change + (detail ? ': ' + detail : ''));
    }
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
    const identityInputs = [...capabilities.entries()].map(([capability, item]) => ({
      logicalPath: `specs/${capability}/spec.md`,
      content: item.content,
    }));
    return { capabilities, operations, hash: openSpecContractHash(identityInputs) };
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

  function detectOpenSpecActiveConflicts(projectRoot, change, delta, result, executable) {
    const current = new Set(openSpecDeltaIdentities(delta).map((item) => `${item.capability}\u0000${item.requirement}`));
    const observations = [{ change, status: 'current', deltaDigest: delta.hash, diagnosticCode: null }];
    for (const candidate of listActiveOpenSpecChangeRoots(projectRoot)) {
      if (candidate.id === change) continue;
      let other;
      try {
        validateUpstreamOpenSpecStrict(projectRoot, candidate.id, executable);
        other = parseOpenSpecChangeDelta(candidate.root);
        observations.push({ change: candidate.id, status: 'valid', deltaDigest: other.hash, diagnosticCode: null });
      } catch (error) {
        observations.push({ change: candidate.id, status: 'invalid', deltaDigest: null, diagnosticCode: 'openspec_contract.active_change_invalid' });
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
          nextAction: '合并语义相同的 change，或先完成前序 change 后重新建立后续 Change 的 Content Target。',
        });
      }
    }
    return observations.sort((left, right) => left.change.localeCompare(right.change));
  }

  function openSpecExecutableIdentity(context) {
    const executable = context.component.executablePath;
    const versionResult = spawnCommandSync(executable, ['--version'], { cwd: context.projectRoot, encoding: 'utf8' });
    return portableExecutableIdentity({
      projectRoot: context.projectRoot,
      executable,
      version: versionResult.status === 0 ? versionResult.stdout.trim() : null,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
    });
  }

  function observeOpenSpecCanonicalProject(projectRoot) {
    const specsRoot = path.join(projectRoot, 'openspec', 'specs');
    const files = fs.readdirSync(specsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsFile(path.join(specsRoot, entry.name, 'spec.md')))
      .map((entry) => {
        const file = path.join(specsRoot, entry.name, 'spec.md');
        return {
          path: `openspec/specs/${entry.name}/spec.md`,
          digest: openSpecContractHash(normalizeOpenSpecContractText(fs.readFileSync(file, 'utf8'))),
        };
      })
      .sort((left, right) => left.path.localeCompare(right.path));
    return { identity: openSpecContractHash(files), files };
  }

  function openSpecConvergencePlanningInputs(context, stage) {
    const executable = context.component.executablePath;
    const executableIdentity = openSpecExecutableIdentity(context);
    const proposal = parseOpenSpecProposalCapabilities(context.changeRoot);
    const conflictResult = createOpenSpecContractResult(stage, context.change, context.project, context.component.upstreamVersion);
    const activeChanges = context.archived
      ? []
      : detectOpenSpecActiveConflicts(context.projectRoot, context.change, context.delta, conflictResult, executable);
    const activeConflicts = [
      ...conflictResult.conflicts.map((item) => ({ ...item, code: 'active-change-conflict' })),
      ...conflictResult.findings.filter((item) => item.severity === 'error' && item.code !== 'openspec_contract.active_conflict')
        .map((item) => ({ change: item.change || null, capability: item.capability || null, requirement: item.requirement || null, code: item.code, message: item.message })),
    ];
    return { executable, executableIdentity, capabilityPurposes: proposal.descriptions, activeChanges, activeConflicts };
  }

  function openSpecContractContext(args, options = {}) {
    const allowed = new Set(['--target', '--project', '--json']);
    for (const option of options.allowedOptions || []) allowed.add(option);
    assertNoUnknownOptions(args, allowed, new Set(['--json']));
    const positionals = positionalArgs(args);
    const change = positionals[0];
    if (!change || positionals.length !== 1) throw new Error(`Usage: ${options.usage}`);
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const project = optionValue(args, '--project');
    const { projectRoot } = resolveOpenSpecContractProject(targetRoot, project);
    const component = openSpecContractComponent(targetRoot);
    let resolvedChange;
    try {
      resolvedChange = options.allowArchived ? openSpecConvergenceChangePath(projectRoot, change) : { changeRoot: openSpecContractChangePath(projectRoot, change), archived: false };
    } catch (error) {
      if (error.code === 'openspec.active_change_not_found') error.usage = options.usage;
      throw error;
    }
    const { changeRoot, archived } = resolvedChange;
    if (!archived) validateUpstreamOpenSpecStrict(projectRoot, change, component.executablePath);
    const delta = parseOpenSpecChangeDelta(changeRoot);
    if (delta.operations.length === 0) throw new Error(`OpenSpec change has no delta Requirements: ${change}`);
    return { targetRoot, project, projectRoot, component, change, changeRoot, delta, archived };
  }

  function openspecConverge(args) {
    const context = openSpecContractContext(args, {
      usage: 'buildr openspec converge <change> --project <project> [--target <task-execution-root>] [--json]',
      allowArchived: true,
    });
    const planning = openSpecConvergencePlanningInputs(context, 'converge');
    const openspecExecutable = planning.executable;
    const resolveArchivedChangeRoot = () => {
      const resolved = openSpecConvergenceChangePath(context.projectRoot, context.change);
      if (!resolved.archived) throw new Error('OpenSpec archive command did not move the Change.');
      return resolved.changeRoot;
    };
    const convergence = runOpenSpecConvergence({
      context,
      executable: openspecExecutable,
      executableIdentity: planning.executableIdentity,
      capabilityPurposes: planning.capabilityPurposes,
      activeConflicts: planning.activeConflicts,
      validateProjected: ({ files }) => validateProjectedOpenSpec({ projectRoot: context.projectRoot, files, executable: openspecExecutable, copyDirectory, atomicWriteFile, removePath }),
      validateActual: () => validateActualOpenSpec({ projectRoot: context.projectRoot, executable: openspecExecutable }),
      archive: () => {
        const startedAt = Date.now();
        const archived = spawnCommandSync(openspecExecutable, ['archive', context.change, '--yes', '--skip-specs'], { cwd: context.projectRoot, encoding: 'utf8' });
        const raw = String(archived.stderr || archived.stdout || '');
        const portable = raw
          .replace(/file:\/\/\/[^\s)]+/g, 'file://<host-path>')
          .replace(/\/(?:Users|home)\/[^\s"')]+/g, '<host-path>')
          .replace(/Error while flushing PostHog[\s\S]*/g, '')
          .trim()
          .slice(0, 2000);
        return {
          status: archived.status === 0 ? 'passed' : 'blocked',
          code: archived.status === 0 ? null : 'archive-failed',
          exitCode: archived.status,
          durationMs: Date.now() - startedAt,
          commandCount: 1,
          diagnostic: portable || null,
        };
      },
      resolveArchivedChangeRoot,
      writeReceipt: writeOpenSpecContractJson,
    });
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecConverge, convergence);
    if (hasFlag(args, '--json')) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else console.log(`OpenSpec convergence: ${payload.status} (${payload.durationMs}ms)`);
    process.exitCode = payload.status === 'passed' ? 0 : 2;
  }

  function openspecConvergencePreflight(args) {
    const startedAt = Date.now();
    const context = openSpecContractContext(args, {
      usage: 'buildr openspec convergence preflight <change> --project <project> [--target <task-execution-root>] [--json]',
      allowArchived: false,
    });
    const planning = openSpecConvergencePlanningInputs(context, 'preflight');
    const preflight = runOpenSpecConvergencePreflight({
      context,
      executableIdentity: planning.executableIdentity,
      capabilityPurposes: planning.capabilityPurposes,
      activeConflicts: planning.activeConflicts,
      activeChanges: planning.activeChanges,
      canonicalFiles: canonicalSnapshots({ projectRoot: context.projectRoot, delta: context.delta, io: fs }),
      canonicalObservation: observeOpenSpecCanonicalProject(context.projectRoot),
      startedAt,
      commandCountOffset: planning.activeChanges.length + 1,
      validateProjected: ({ files }) => validateProjectedOpenSpec({
        projectRoot: context.projectRoot,
        files,
        executable: planning.executable,
        copyDirectory,
        atomicWriteFile,
        removePath,
        mode: 'preflight',
      }),
    });
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecConvergencePreflight, preflight);
    if (hasFlag(args, '--json')) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else console.log(`OpenSpec convergence preflight: ${payload.status} (${payload.durationMs}ms)`);
    process.exitCode = payload.status === 'ready' ? 0 : 2;
  }

  function openspecConvergenceInspect(args) {
    assertNoUnknownOptions(args, new Set(['--target', '--project', '--json']), new Set(['--json']));
    const positionals = positionalArgs(args);
    const change = positionals[0];
    if (!change || positionals.length !== 1) throw new Error('Usage: buildr openspec convergence inspect <change> --project <project> [--target <dir>] [--json]');
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const project = optionValue(args, '--project');
    const { projectRoot } = resolveOpenSpecContractProject(targetRoot, project);
    const resolved = openSpecConvergenceChangePath(projectRoot, change);
    const receiptFile = convergenceReceiptPath(resolved.changeRoot);
    let payload;
    if (resolved.archived) {
      payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecConvergenceInspect, {
        change, project, status: 'not-applicable', disposition: null, files: [], receipt: null,
        reason: { code: 'convergence-terminal', message: 'OpenSpec Change已经归档；当前没有可恢复的Convergence transaction。' },
        diagnostic: null, nextActions: [],
      });
    } else if (!existsFile(receiptFile)) {
      payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecConvergenceInspect, {
        change, project, status: 'not-applicable', disposition: null, files: [], receipt: null,
        reason: { code: 'convergence-not-started', message: 'OpenSpec Convergence尚未开始，没有事务Receipt需要检查。' },
        diagnostic: null, nextActions: [`运行 buildr openspec converge ${change} --project ${project}。`],
      });
    } else try {
      const receipt = readOpenSpecContractJson(receiptFile, CONVERGENCE_RECEIPT_SCHEMA);
      const observed = observeConvergence({ projectRoot, receipt, archived: resolved.archived, io: fs });
      payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecConvergenceInspect, {
        change, project, status: observed.disposition === 'state-unknown' ? 'recovery-unprovable' : 'passed',
        disposition: observed.disposition, files: observed.files,
        receipt: toPosixRelative(projectRoot, receiptFile),
        reason: null,
        diagnostic: observed.disposition === 'state-unknown'
          ? { code: 'convergence-state-unknown', message: 'Canonical files do not match one provable transaction state.' }
          : null,
        nextActions: observed.disposition === 'state-unknown'
          ? ['停止正式文件写入并人工核对 unknown 文件；不得刷新旧 baseline 或删除回执。']
          : [`重新运行 buildr openspec converge ${change} --project ${project}。`],
      });
    } catch (error) {
      payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.openspecConvergenceInspect, {
        change, project, status: 'recovery-unprovable', disposition: 'state-unknown', files: [],
        receipt: toPosixRelative(projectRoot, receiptFile),
        reason: null,
        diagnostic: { code: 'convergence-receipt-invalid', message: error.message },
        nextActions: ['人工核对唯一 convergence receipt 与正式文件；不得从旧旁路状态生成授权事实。'],
      });
    }
    if (hasFlag(args, '--json')) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else console.log(`OpenSpec convergence inspect: ${payload.status}${payload.disposition ? ` (${payload.disposition})` : ''}`);
    process.exitCode = payload.status === 'recovery-unprovable' ? 2 : 0;
  }

  Object.assign(runtime, { normalizeOpenSpecContractText, openSpecContractHash, openSpecContractChangePath, resolveOpenSpecContractProject, openSpecContractComponent, parseOpenSpecRequirementBlocks, openSpecSection, parseOpenSpecDeltaSpec, parseOpenSpecChangeDelta, readOpenSpecCanonicalRequirements, parseOpenSpecProposalCapabilities, readOpenSpecContractJson, writeOpenSpecContractJson, createOpenSpecContractResult, addOpenSpecContractFinding, listActiveOpenSpecChangeRoots, openSpecDeltaIdentities, detectOpenSpecActiveConflicts, openSpecContractContext, openSpecExecutableIdentity, observeOpenSpecCanonicalProject, openSpecConvergencePlanningInputs, openspecConverge, openspecConvergencePreflight, openspecConvergenceInspect });
  return runtime;
}
