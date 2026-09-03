import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildCommandInvocation, findExecutableOnPath as resolveExecutableOnPath, spawnSync } from '../../infrastructure/process.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';

export function registerDomainsCommands(runtime: any): any  {
  const doctor = (...args: any[]) => runtime.doctor(...args);
  const workspaceSymlinkSegment = (...args: any[]) => runtime.workspaceSymlinkSegment(...args);
  const componentOwnerForMember = (...args: any[]) => runtime.componentOwnerForMember(...args);
  const isValidAssetId = (...args: any[]) => runtime.isValidAssetId(...args);
  const assertName = (...args: any[]) => runtime.assertName(...args);
  const normalizeRelativePathForBuildr = (...args: any[]) => runtime.normalizeRelativePathForBuildr(...args);
  const quoteYaml = (...args: any[]) => runtime.quoteYaml(...args);
  const parseYamlValue = (...args: any[]) => runtime.parseYamlValue(...args);
  const optionValue = (...args: any[]) => runtime.optionValue(...args);
  const optionValueRaw = (...args: any[]) => runtime.optionValueRaw(...args);
  const atomicWriteFile = (...args: any[]) => runtime.atomicWriteFile(...args);
  const parseYamlDocument = (...args: any[]) => runtime.parseYamlDocument(...args);
  const withWorkspaceMutation = (...args: any[]) => runtime.withWorkspaceMutation(...args);
  const hasFlag = (...args: any[]) => runtime.hasFlag(...args);
  const toPosixRelative = (...args: any[]) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args: any[]) => runtime.existsDirectory(...args);
  const existsFile = (...args: any[]) => runtime.existsFile(...args);
  const assertInitializedBuildrWorkspace = (...args: any[]) => runtime.assertInitializedBuildrWorkspace(...args);
  const parseProjectsYaml = (...args: any[]) => runtime.parseProjectsYaml(...args);
  const projectsManifestPath = (...args: any[]) => runtime.projectsManifestPath(...args);

  const PROJECT_COMMANDS_SCHEMA = 'buildr.project-commands/v1';

  function normalizeCommandCollection(collection: any): any  {
    if (!collection) return null;
    const normalized = normalizeRelativePathForBuildr(collection, `Command collection must stay inside commands/: ${collection}`)
      .replace(/^commands\//, '')
      .replace(/\/manifest\.yml$/, '');
    if (!normalized || normalized === 'manifest.yml') throw new Error(`Command collection must name a nested collection: ${collection}`);
    return normalized;
  }

  function commandsManifestPath(targetRoot: any, collection: any = null): any  {
    const normalized = normalizeCommandCollection(collection);
    return normalized
      ? path.join(targetRoot, 'commands', normalized, 'manifest.yml')
      : path.join(targetRoot, 'commands', 'manifest.yml');
  }

  function assertSafeCommandCollectionTarget(targetRoot: any, manifestPath: any): any  {
    const relative = toPosixRelative(targetRoot, manifestPath);
    const symlink = workspaceSymlinkSegment(targetRoot, relative);
    if (symlink) throw new Error(`Command collection path crosses a symbolic link: ${symlink}`);
  }

  function listCommandsManifestPaths(targetRoot: any): any  {
    const root = path.join(targetRoot, 'commands');
    if (!existsDirectory(root)) return [];
    const files: any[] = [];
    function visit(dir: any): any  {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a: any, b: any) => a.name.localeCompare(b.name))) {
        const absolute = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile() && entry.name === 'manifest.yml') files.push(absolute);
      }
    }
    visit(root);
    return files.sort((left: any, right: any) => {
      const rootManifest = commandsManifestPath(targetRoot);
      if (left === rootManifest) return -1;
      if (right === rootManifest) return 1;
      return left.localeCompare(right);
    });
  }

  function parseCommandsManifestYaml(content: any): any  {
    const manifest = parseYamlDocument(content, 'commands manifest');
    return manifest;
  }

  function projectCommandsPath(targetRoot: any, project: any): any  {
    return path.join(targetRoot, 'projects', project, 'commands.yml');
  }

  function parseProjectCommandsYaml(content: any, file: any = 'commands.yml'): any  {
    return parseYamlDocument(content, file);
  }

  function validateProjectCommandsDocument(document: any): any  {
    const errors: any[] = [];
    if (!isPlainObject(document)) return ['Project commands document must be an object.'];
    if (document.schemaVersion !== PROJECT_COMMANDS_SCHEMA) errors.push(`Project commands schemaVersion must be ${PROJECT_COMMANDS_SCHEMA}.`);
    if (!Array.isArray(document.requirements)) return [...errors, 'Project commands document must declare requirements as an array.'];
    const ids: any = new Set();
    const allowedKeys: any = new Set(['id', 'required', 'version', 'purpose']);
    document.requirements.forEach((requirement: any, index: any) => {
      const label = `requirements[${index}]`;
      if (!isPlainObject(requirement)) {
        errors.push(`${label} must be an object.`);
        return;
      }
      for (const key of Object.keys(requirement)) if (!allowedKeys.has(key)) errors.push(`${label}.${key} is not a supported Project Command requirement field.`);
      if (!isValidAssetId(requirement.id)) errors.push(`${label}.id must contain only letters, digits, dots, underscores, or dashes.`);
      else if (ids.has(requirement.id)) errors.push(`Duplicate Project Command requirement id: ${requirement.id}.`);
      else ids.add(requirement.id);
      if (requirement.required !== undefined && typeof requirement.required !== 'boolean') errors.push(`${label}.required must be a boolean.`);
      if (requirement.version !== undefined && (typeof requirement.version !== 'string' || !parseVersionConstraint(requirement.version))) errors.push(`${label}.version is invalid: ${requirement.version}.`);
      if (requirement.purpose !== undefined && typeof requirement.purpose !== 'string') errors.push(`${label}.purpose must be a string when provided.`);
    });
    return errors;
  }

  function renderProjectCommandsYaml(document: any = {}): any  {
    const requirements = document.requirements || [];
    const lines: any[] = [`schemaVersion: ${PROJECT_COMMANDS_SCHEMA}`];
    if (requirements.length === 0) return `${lines.concat('requirements: []').join('\n')}\n`;
    lines.push('requirements:');
    for (const requirement of requirements) {
      lines.push(`  - id: ${quoteYaml(requirement.id)}`);
      if (requirement.required !== undefined) lines.push(`    required: ${quoteYaml(Boolean(requirement.required))}`);
      if (requirement.version !== undefined) lines.push(`    version: ${quoteYaml(requirement.version)}`);
      if (requirement.purpose !== undefined) lines.push(`    purpose: ${quoteYaml(requirement.purpose)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  function repeatedOptionValues(args: any, flag: any): any  {
    const values: any[] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] !== flag) continue;
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      values.push(value);
      index += 1;
    }
    return values;
  }

  function isPlainObject(value: any): any  {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function validateCommandsManifest(manifest: any): any  {
    const errors: any[] = [];
    if (manifest.schemaVersion !== 'buildr.commands/v1') {
      errors.push('commands manifest schemaVersion must be buildr.commands/v1.');
    }
    if (!Array.isArray(manifest.commands)) {
      errors.push('commands manifest must declare commands as an array.');
      return errors;
    }

    const ids: any = new Set();
    const allowedCommandKeys: any = new Set(['id', 'source', 'enabled', 'required', 'state', 'name', 'executable', 'purpose', 'description', 'version', 'installHint', 'reason']);
    const allowedVersionKeys: any = new Set(['constraint', 'args']);
    manifest.commands.forEach((command: any, index: any) => {
      const label = `commands[${index}]`;
      if (!isPlainObject(command)) {
        errors.push(`${label} must be an object.`);
        return;
      }
      for (const key of Object.keys(command)) {
        if (!allowedCommandKeys.has(key)) {
          errors.push(`${label}.${key} is not a supported commands manifest field.`);
        }
      }
      if (!isValidAssetId(command.id)) {
        errors.push(`${label}.id must contain only letters, digits, dots, underscores, or dashes.`);
      } else if (ids.has(command.id)) {
        errors.push(`Duplicate command id: ${command.id}.`);
      } else {
        ids.add(command.id);
      }
      if (!command.executable || typeof command.executable !== 'string' || /\s/.test(command.executable) || command.executable.includes('/') || command.executable.includes('\\')) {
        if (command.enabled !== false && command.state !== 'uninstalled') {
          errors.push(`${label}.executable must be a command name without whitespace or path separators.`);
        }
      }
      if (!command.purpose || typeof command.purpose !== 'string') {
        errors.push(`${label}.purpose is required.`);
      }
      if (command.source !== undefined && !['buildr', 'workspace', 'project', 'service'].includes(command.source)) {
        errors.push(`${label}.source must be buildr, workspace, project, or service when provided.`);
      }
      if (command.enabled !== undefined && typeof command.enabled !== 'boolean') {
        errors.push(`${label}.enabled must be a boolean.`);
      }
      if (command.required !== undefined && typeof command.required !== 'boolean') {
        errors.push(`${label}.required must be a boolean.`);
      }
      if (command.state !== undefined && !['installed', 'modified', 'uninstalled', 'missing'].includes(command.state)) {
        errors.push(`${label}.state must be installed, modified, uninstalled, or missing.`);
      }
      if (command.name !== undefined && typeof command.name !== 'string') {
        errors.push(`${label}.name must be a string when provided.`);
      }
      if (command.description !== undefined && typeof command.description !== 'string') {
        errors.push(`${label}.description must be a string when provided.`);
      }
      if (command.installHint !== undefined && typeof command.installHint !== 'string') {
        errors.push(`${label}.installHint must be a string when provided.`);
      }
      if (command.install !== undefined) {
        errors.push(`${label}.install is not supported. Use installHint instead.`);
      }
      if (command.version !== undefined) {
        if (!isPlainObject(command.version)) {
          errors.push(`${label}.version must be an object.`);
        } else {
          for (const key of Object.keys(command.version)) {
            if (!allowedVersionKeys.has(key)) {
              errors.push(`${label}.version.${key} is not a supported version field.`);
            }
          }
          const { constraint, args } = command.version;
          if (constraint !== undefined && (typeof constraint !== 'string' || !parseVersionConstraint(constraint))) {
            errors.push(`${label}.version.constraint is invalid: ${constraint}.`);
          }
          if (!Array.isArray(args) || !args.every((arg: any) => typeof arg === 'string')) {
            errors.push(`${label}.version.args must be an array of strings.`);
          }
        }
      }
    });
    return errors;
  }

  function renderCommandsManifestYaml(manifest: any): any  {
    const lines: any[] = ['schemaVersion: buildr.commands/v1'];
    if (!manifest.commands || manifest.commands.length === 0) {
      lines.push('commands: []');
      return `${lines.join('\n')}\n`;
    }

    lines.push('commands:');
    for (const command of manifest.commands) {
      lines.push(`  - id: ${quoteYaml(command.id)}`);
      for (const key of ['source']) {
        if (command[key] !== undefined) lines.push(`    ${key}: ${quoteYaml(command[key])}`);
      }
      if (command.enabled !== undefined) lines.push(`    enabled: ${quoteYaml(Boolean(command.enabled))}`);
      if (command.required !== undefined) lines.push(`    required: ${quoteYaml(Boolean(command.required))}`);
      if (command.state !== undefined) lines.push(`    state: ${quoteYaml(command.state)}`);
      for (const key of ['name', 'executable', 'purpose', 'description']) {
        if (command[key] !== undefined) lines.push(`    ${key}: ${quoteYaml(command[key])}`);
      }
      if (command.version) {
        lines.push('    version:');
        if (command.version.constraint !== undefined) lines.push(`      constraint: ${quoteYaml(command.version.constraint)}`);
        lines.push(`      args: ${quoteYaml(command.version.args)}`);
      }
      if (command.installHint !== undefined) {
        lines.push(`    installHint: ${quoteYaml(command.installHint)}`);
      }
      if (command.reason !== undefined) {
        lines.push(`    reason: ${quoteYaml(command.reason)}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  function readCommandsManifestForWrite(targetRoot: any, collection: any = null): any  {
    const manifestPath = commandsManifestPath(targetRoot, collection);
    assertSafeCommandCollectionTarget(targetRoot, manifestPath);
    if (!existsFile(manifestPath)) {
      return { schemaVersion: 'buildr.commands/v1', commands: [] };
    }
    const manifest = parseCommandsManifestYaml(fs.readFileSync(manifestPath, 'utf8'));
    const validationErrors = validateCommandsManifest(manifest);
    if (validationErrors.length > 0) {
      throw new Error(`${toPosixRelative(targetRoot, manifestPath)} is invalid:\n- ${validationErrors.join('\n- ')}`);
    }
    return manifest;
  }

  function writeCommandsManifest(targetRoot: any, manifest: any, collection: any = null): any  {
    const manifestPath = commandsManifestPath(targetRoot, collection);
    assertSafeCommandCollectionTarget(targetRoot, manifestPath);
    atomicWriteFile(manifestPath, renderCommandsManifestYaml(manifest));
    return manifestPath;
  }

  function parseVersionArgs(value: any): any  {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      const parsed = parseYamlValue(trimmed);
      if (!Array.isArray(parsed) || !parsed.every((item: any) => typeof item === 'string')) {
        throw new Error('--version-args must be a JSON array of strings or a comma-separated string.');
      }
      return parsed;
    }
    return trimmed.split(',').map((item: any) => item.trim()).filter(Boolean);
  }

  function assertNoUnknownOptions(args: any, allowedFlags: any, booleanFlags: any = new Set()): any  {
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (!arg.startsWith('--')) continue;
      if (!allowedFlags.has(arg)) {
        throw new Error(`Unknown argument: ${arg}`);
      }
      if (!booleanFlags.has(arg)) index += 1;
    }
  }

  function positionalArgs(args: any): any  {
    const booleanFlags: any = new Set(['--replace', '--ignore-unsupported', '--keep-file', '--json', '--include-info', '--verbose']);
    const result: any[] = [];
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (!arg.startsWith('--')) {
        result.push(arg);
        continue;
      }
      if (!booleanFlags.has(arg)) index += 1;
    }
    return result;
  }

  function buildCommandEntry(id: any, args: any): any  {
    assertName(id, 'Command id');
    const purpose = optionValue(args, '--purpose', null);
    if (!purpose) throw new Error('Missing required option: --purpose');
    const entry: any = {
      id,
      executable: optionValue(args, '--executable', id),
      purpose,
    };
    const name = optionValue(args, '--name', null);
    const description = optionValue(args, '--description', null);
    const installHint = optionValue(args, '--install-hint', optionValue(args, '--installHint', null));
    const versionConstraint = optionValue(args, '--version-constraint', null);
    const versionArgs = parseVersionArgs(optionValueRaw(args, '--version-args', null));

    if (name) entry.name = name;
    if (description) entry.description = description;
    if (versionConstraint || versionArgs) {
      if (!versionConstraint || !versionArgs) {
        throw new Error('Version declaration requires both --version-constraint and --version-args.');
      }
      entry.version = { constraint: versionConstraint, args: versionArgs };
    }
    if (installHint) entry.installHint = installHint;

    const errors = validateCommandsManifest({ schemaVersion: 'buildr.commands/v1', commands: [entry] });
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return entry;
  }

  function printCommandsMutationReceipt(action: any, targetRoot: any, id: any, updatedPaths: any, nextAction: any): any  {
    console.log(`已${action}命令行工具清单条目：${id}`);
    console.log('已更新 Buildr 源资产：');
    for (const file of updatedPaths) console.log(`  ${toPosixRelative(targetRoot, file)}`);
    console.log('下一步：');
    console.log(`  ${nextAction}`);
  }

  function commandsAddUnsafe(args: any): any  {
    const allowedFlags: any = new Set(['--target', '--collection', '--purpose', '--executable', '--name', '--description', '--version-constraint', '--version-args', '--install-hint', '--installHint', '--replace']);
    assertNoUnknownOptions(args, allowedFlags, new Set(['--replace']));
    const [id] = positionalArgs(args);
    if (!id) throw new Error('Missing command id');
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    assertInitializedBuildrWorkspace(targetRoot);
    const collection = optionValue(args, '--collection', null);
    const manifestPath = commandsManifestPath(targetRoot, collection);
    const relativeManifest = toPosixRelative(targetRoot, manifestPath);
    const owner = componentOwnerForMember(targetRoot, relativeManifest);
    if (owner) throw new Error(`Command collection is managed by Component ${owner}: ${relativeManifest}. Use buildr component lifecycle commands.`);

    const manifest = readCommandsManifestForWrite(targetRoot, collection);
    const entry = buildCommandEntry(id, args);
    const replace = hasFlag(args, '--replace');
    const existingIndex = manifest.commands.findIndex((command: any) => command.id === id);
    if (existingIndex !== -1 && !replace) {
      throw new Error(`Command already exists in ${relativeManifest}: ${id}. Use --replace to replace the whole entry.`);
    }
    if (existingIndex === -1) {
      manifest.commands.push(entry);
    } else {
      manifest.commands[existingIndex] = entry;
    }

    writeCommandsManifest(targetRoot, manifest, collection);
    printCommandsMutationReceipt(
      existingIndex === -1 ? '添加' : '替换',
      targetRoot,
      id,
      [manifestPath],
      '运行命令行工具清单检查或 doctor 查看当前本机与组织清单的差异。'
    );
  }

  function commandsAdd(args: any): any  {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    return withWorkspaceMutation(targetRoot, 'commands.add', [path.join(targetRoot, 'commands')], () => commandsAddUnsafe(args));
  }

  function commandsRemoveUnsafe(args: any): any  {
    const allowedFlags: any = new Set(['--target', '--collection']);
    assertNoUnknownOptions(args, allowedFlags);
    const [id] = positionalArgs(args);
    if (!id) throw new Error('Missing command id');
    assertName(id, 'Command id');
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    assertInitializedBuildrWorkspace(targetRoot);
    const collection = optionValue(args, '--collection', null);
    const manifestPath = commandsManifestPath(targetRoot, collection);
    const relativeManifest = toPosixRelative(targetRoot, manifestPath);
    const owner = componentOwnerForMember(targetRoot, relativeManifest);
    if (owner) throw new Error(`Command collection is managed by Component ${owner}: ${relativeManifest}. Use buildr component lifecycle commands.`);

    const manifest = readCommandsManifestForWrite(targetRoot, collection);
    const existingIndex = manifest.commands.findIndex((command: any) => command.id === id);
    if (existingIndex === -1) {
      throw new Error(`Command not found in ${relativeManifest}: ${id}`);
    }
    const blockers = commandRemovalBlockers(targetRoot, id, [manifestPath]);
    if (blockers.length) {
      const blockerLabel = (item: any) => {
        if (item.kind === 'project') return `Project ${item.project}`;
        if (item.kind === 'invalid-project-context') return `unverifiable Project context${item.project ? ` ${item.project}` : ''}`;
        return 'workspace default';
      };
      const error: Error & Record<string, any> = new Error(`Command definition ${id} 仍被 requirements 引用或引用关系不可验证，保持零写入：\n${blockers.map((item: any) => `- ${blockerLabel(item)}: ${item.path}`).join('\n')}\n先解除或修复对应 requirement，再重试删除。`);
      error.code = 'command_definition_referenced';
      error.reason = 'command_definition_referenced';
      error.references = blockers;
      throw error;
    }
    manifest.commands.splice(existingIndex, 1);
    writeCommandsManifest(targetRoot, manifest, collection);
    printCommandsMutationReceipt(
      '删除',
      targetRoot,
      id,
      [manifestPath],
      '运行命令行工具清单检查或 doctor 确认当前 workspace 状态。'
    );
  }

  function commandsRemove(args: any): any  {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    return withWorkspaceMutation(targetRoot, 'commands.remove', [path.join(targetRoot, 'commands')], () => commandsRemoveUnsafe(args));
  }

  function parseVersionConstraint(constraint: any): any  {
    const match = String(constraint).trim().match(/^(>=|>|<=|<|=)?\s*(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return null;
    return {
      operator: match[1] || '=',
      version: [Number(match[2]), Number(match[3]), Number(match[4])],
      rawVersion: `${match[2]}.${match[3]}.${match[4]}`,
    };
  }

  function parseVersion(version: any): any  {
    const match = String(version).match(/(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }

  function compareVersions(left: any, right: any): any  {
    for (let index = 0; index < 3; index += 1) {
      if (left[index] > right[index]) return 1;
      if (left[index] < right[index]) return -1;
    }
    return 0;
  }

  function versionSatisfies(version: any, constraint: any): any  {
    const comparison = compareVersions(version, constraint.version);
    switch (constraint.operator) {
      case '>=': return comparison >= 0;
      case '>': return comparison > 0;
      case '<=': return comparison <= 0;
      case '<': return comparison < 0;
      case '=': return comparison === 0;
      default: return false;
    }
  }

  function findExecutableOnPath(executable: any): any  {
    return resolveExecutableOnPath(executable);
  }

  function buildCommandProbeInvocation(executablePath: any, args: any, options: any = {}): any  {
    return buildCommandInvocation(executablePath, args, options);
  }

  function probeCommandVersion(executablePath: any, args: any, options: any = {}): any  {
    const probe = buildCommandProbeInvocation(executablePath, args, options);
    const spawn = options.spawn || spawnSync;
    const result = spawn(probe.executable, probe.args, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      shell: probe.shell,
    });
    if (result.error) return {
      status: 'spawn-failed',
      invocation: probe,
      error: { code: result.error.code || null, message: result.error.message },
    };
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    const currentVersion = parseVersion(output);
    return {
      status: currentVersion ? 'parsed' : 'unknown',
      invocation: probe,
      output,
      currentVersion,
    };
  }

  function createCommandsCheckResult(targetRoot: any): any  {
    return {
      targetRoot,
      manifest: {
        path: 'commands/manifest.yml',
        exists: false,
        valid: false,
        schemaVersion: null,
      },
      manifests: [],
      ok: true,
      summary: { ok: 0, warning: 0, error: 0 },
      commands: [],
      findings: [],
      nextSteps: [],
    };
  }

  function addCommandsFinding(result: any, status: any, code: any, message: any, extra: any = {}): any  {
    result.findings.push({ status, code, message, ...extra });
  }

  function stableValue(value: any): any  {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!isPlainObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key: any) => [key, stableValue(value[key])]));
  }

  function commandDefinitionIdentity(command: any): any  {
    return {
      id: command.id,
      executable: command.executable,
      purpose: command.purpose,
      name: command.name || null,
      description: command.description || null,
      versionArgs: command.version?.args || null,
      installHint: command.installHint || null,
    };
  }

  function normalizedCommandSignature(command: any): any  {
    return JSON.stringify(stableValue(commandDefinitionIdentity(command)));
  }

  function readRegisteredProjects(targetRoot: any): any  {
    const registryPath = projectsManifestPath(targetRoot);
    if (!existsFile(registryPath)) return { path: 'projects/manifest.yml', projects: {} };
    const registry = parseProjectsYaml(fs.readFileSync(registryPath, 'utf8'));
    return { path: toPosixRelative(targetRoot, registryPath), projects: registry.projects || {} };
  }

  function intersectVersionConstraints(rawConstraints: any): any  {
    const constraints = rawConstraints.filter(Boolean).map((raw: any) => ({ ...parseVersionConstraint(raw), raw }));
    if (constraints.some((constraint: any) => !constraint.operator)) return { compatible: false, constraint: null, constraints: rawConstraints };
    let exact: any = null;
    let lower: any = null;
    let upper: any = null;
    for (const constraint of constraints) {
      if (constraint.operator === '=') {
        if (exact && compareVersions(exact.version, constraint.version) !== 0) return { compatible: false, constraint: null, constraints: rawConstraints };
        exact = constraint;
      } else if (constraint.operator === '>' || constraint.operator === '>=') {
        if (!lower || compareVersions(constraint.version, lower.version) > 0 || (compareVersions(constraint.version, lower.version) === 0 && constraint.operator === '>')) lower = constraint;
      } else if (constraint.operator === '<' || constraint.operator === '<=') {
        if (!upper || compareVersions(constraint.version, upper.version) < 0 || (compareVersions(constraint.version, upper.version) === 0 && constraint.operator === '<')) upper = constraint;
      }
    }
    if (exact && constraints.some((constraint: any) => !versionSatisfies(exact.version, constraint))) return { compatible: false, constraint: null, constraints: rawConstraints };
    if (lower && upper) {
      const comparison = compareVersions(lower.version, upper.version);
      if (comparison > 0 || (comparison === 0 && (lower.operator === '>' || upper.operator === '<'))) return { compatible: false, constraint: null, constraints: rawConstraints };
    }
    const merged = exact?.raw || [lower?.raw, upper?.raw].filter(Boolean).join(' ') || null;
    return { compatible: true, constraint: merged, constraints: rawConstraints };
  }

  function readProjectRequirementRecords(targetRoot: any, result: any): any  {
    const registry = readRegisteredProjects(targetRoot);
    const records: any[] = [];
    for (const project of Object.keys(registry.projects).sort()) {
      const file = projectCommandsPath(targetRoot, project);
      const relative = toPosixRelative(targetRoot, file);
      if (!existsFile(file)) {
        addCommandsFinding(result, 'info', 'commands.project_context_missing', `Project ${project} 尚未创建 commands.yml，按空 requirements 兼容。`, {
          path: relative,
          project,
          suggestion: `运行 buildr project create ${project} --target ${targetRoot} 安全补齐空 Commands context。`,
          userActionRequired: false,
        });
        continue;
      }
      try {
        const document = parseProjectCommandsYaml(fs.readFileSync(file, 'utf8'), relative);
        const errors = validateProjectCommandsDocument(document);
        if (errors.length) {
          for (const message of errors) addCommandsFinding(result, 'error', 'commands.project_requirements_invalid', message, { path: relative, project, reason: 'project_requirements_invalid' });
          continue;
        }
        for (const requirement of document.requirements) records.push({
          id: requirement.id,
          required: requirement.required !== false,
          version: requirement.version || null,
          purpose: requirement.purpose || null,
          project,
          source: relative,
          provenance: { kind: 'project', project, path: relative },
        });
      } catch (error: any) {
        addCommandsFinding(result, 'error', 'commands.project_requirements_invalid', `Project Commands context 不可解析：${error.message}`, { path: relative, project, reason: 'project_requirements_invalid' });
      }
    }
    return { registry, records };
  }

  function commandRemovalBlockers(targetRoot: any, commandId: any, removedManifestPaths: any = []): any  {
    const removed: any = new Set(removedManifestPaths.map((file: any) => path.resolve(file)));
    const remaining = listCommandsManifestPaths(targetRoot).filter((file: any) => !removed.has(path.resolve(file))).some((file: any) => {
      try {
        const manifest = parseCommandsManifestYaml(fs.readFileSync(file, 'utf8'));
        return validateCommandsManifest(manifest).length === 0 && manifest.commands.some((command: any) => command.id === commandId && command.enabled !== false && command.state !== 'uninstalled');
      } catch {
        return false;
      }
    });
    if (remaining) return [];
    const blockers: any[] = [];
    const result = createCommandsCheckResult(targetRoot);
    const { records } = readProjectRequirementRecords(targetRoot, result);
    for (const finding of result.findings.filter((item: any) => item.status === 'error')) {
      blockers.push({ kind: 'invalid-project-context', project: finding.project || null, path: finding.path, reason: finding.reason });
    }
    for (const record of records.filter((item: any) => item.id === commandId)) blockers.push({ kind: 'project', project: record.project, path: record.source });
    for (const file of removed) {
      if (!existsFile(file)) continue;
      try {
        const manifest = parseCommandsManifestYaml(fs.readFileSync(file, 'utf8'));
        for (const command of manifest.commands.filter((item: any) => item.id === commandId && (item.required !== undefined || item.version?.constraint))) {
          blockers.push({ kind: 'workspace-default', path: toPosixRelative(targetRoot, file) });
        }
      } catch {
        // Existing validation will report malformed manifests before mutation.
      }
    }
    return blockers;
  }

  function finalizeCommandsCheckResult(result: any): any  {
    const counts: any = { ok: 0, info: 0, warning: 0, error: 0 };
    if (result.manifest.exists && result.manifest.valid) counts.ok += 1;
    for (const command of result.commands) counts[command.status] += 1;
    for (const finding of result.findings) {
      if (finding.status === 'error' || finding.status === 'warning') counts[finding.status] += 1;
    }
    result.summary = counts;
    result.ok = counts.error === 0;
    result.nextSteps = result.findings
      .filter((finding: any) => finding.suggestion || finding.installHint)
      .map((finding: any) => ({
        code: finding.code,
        suggestion: finding.suggestion,
        installHint: finding.installHint,
        commandId: finding.commandId,
      }))
      .slice(0, 10);
  }

  function runCommandsCheck(targetRoot: any, options: any = {}): any  {
    const result = createCommandsCheckResult(targetRoot);
    result.catalog = { definitions: [], manifests: result.manifests };
    result.requirements = [];
    result.effectiveConstraints = [];
    result.observations = [];
    result.context = { projects: [...(options.projects || [])] };
    const spawn = options.spawn || spawnSync;
    const rootManifestPath = commandsManifestPath(targetRoot);
    const manifestPaths = listCommandsManifestPaths(targetRoot);
    result.manifest.exists = existsFile(rootManifestPath);
    if (!result.manifest.exists) {
      addCommandsFinding(result, 'warning', 'commands.manifest_missing', '命令行工具清单不存在。', {
        path: result.manifest.path,
        suggestion: '创建 commands/manifest.yml；新 workspace 可通过 buildr init 初始化默认空清单。',
      });
    }
    const commandsById: any = new Map();
    for (const manifestPath of manifestPaths) {
      const relative = toPosixRelative(targetRoot, manifestPath);
      const record: any = { path: relative, exists: true, valid: false, schemaVersion: null, commandCount: 0 };
      result.manifests.push(record);
      try {
        const manifest = parseCommandsManifestYaml(fs.readFileSync(manifestPath, 'utf8'));
        record.schemaVersion = manifest.schemaVersion;
        const validationErrors = validateCommandsManifest(manifest);
        if (validationErrors.length) {
          for (const message of validationErrors) addCommandsFinding(result, 'error', 'commands.manifest_invalid', message, { path: relative });
          continue;
        }
        record.valid = true;
        record.commandCount = manifest.commands.length;
        if (manifestPath === rootManifestPath) {
          result.manifest.schemaVersion = manifest.schemaVersion;
          result.manifest.valid = true;
        }
        for (const command of manifest.commands) {
          const signature = normalizedCommandSignature(command);
          const existing = commandsById.get(command.id);
          if (!existing) {
            commandsById.set(command.id, { command, signature, sources: [relative] });
          } else if (existing.signature === signature) {
            existing.sources.push(relative);
          } else {
            addCommandsFinding(result, 'error', 'commands.catalog_identity_conflict', `Command ${command.id} 在多个 catalog collection 中的 definition identity 冲突。`, {
              commandId: command.id,
              sources: [...existing.sources, relative],
              reason: 'command_catalog_identity_conflict',
              suggestion: '统一重复 Command 的有效字段，或删除其中一个声明。',
            });
          }
        }
      } catch (error: any) {
        addCommandsFinding(result, 'error', 'commands.manifest_invalid', `命令行工具清单不可解析：${error.message}`, { path: relative });
      }
    }

    for (const { command, sources } of commandsById.values()) {
      if (command.enabled === false || command.state === 'uninstalled') {
        addCommandsFinding(result, 'info', 'commands.uninstalled', `命令行工具声明已卸载：${command.id}`, {
          path: sources[0],
          sources,
          commandId: command.id,
          suggestion: '如需恢复，运行 buildr builtin restore。',
        });
        continue;
      }
      result.catalog.definitions.push({ ...commandDefinitionIdentity(command), sources, provenance: sources.map((source: any) => ({ kind: 'workspace-catalog', path: source })) });
      if (command.required !== undefined || command.version?.constraint) result.requirements.push({
        id: command.id,
        required: command.required !== false,
        version: command.version?.constraint || null,
        project: null,
        source: sources[0],
        provenance: { kind: 'workspace-default', paths: sources },
        legacyCatalogConstraint: Boolean(command.version?.constraint),
      });
    }

    const selectedProjects = options.projects || [];
    const duplicateProjects = selectedProjects.filter((project: any, index: any) => selectedProjects.indexOf(project) !== index);
    const { registry, records } = readProjectRequirementRecords(targetRoot, result);
    for (const project of duplicateProjects) addCommandsFinding(result, 'error', 'commands.project_context_invalid', `Project context 重复：${project}`, { project, reason: 'duplicate_project_context' });
    for (const project of selectedProjects) {
      if (!isValidAssetId(project) || !registry.projects[project]) addCommandsFinding(result, 'error', 'commands.project_context_invalid', `Project context 未登记或不安全：${project}`, { project, reason: 'invalid_project_context' });
    }
    result.requirements.push(...records.map((record: any) => ({ ...record, applicable: selectedProjects.includes(record.project) })));

    for (const requirement of records) {
      if (!commandsById.has(requirement.id)) addCommandsFinding(result, 'error', 'commands.definition_missing', `Project ${requirement.project} 引用不存在的 Command definition：${requirement.id}`, {
        commandId: requirement.id,
        project: requirement.project,
        path: requirement.source,
        reason: 'command_definition_missing',
        suggestion: `先在 workspace catalog 登记 ${requirement.id}，或从 ${requirement.source} 删除该引用。`,
      });
    }

    const applicable = result.requirements.filter((requirement: any) => requirement.project === null || requirement.applicable === true);
    const grouped: any = new Map();
    for (const requirement of applicable) {
      if (!grouped.has(requirement.id)) grouped.set(requirement.id, []);
      grouped.get(requirement.id).push(requirement);
    }
    for (const [id, requirements] of grouped) {
      const merged = intersectVersionConstraints(requirements.map((requirement: any) => requirement.version).filter(Boolean));
      const effective: any = {
        id,
        required: requirements.some((requirement: any) => requirement.required),
        constraint: merged.constraint,
        constraints: merged.constraints,
        compatible: merged.compatible,
        provenance: requirements.map((requirement: any) => requirement.provenance),
        projects: [...new Set(requirements.map((requirement: any) => requirement.project).filter(Boolean))],
      };
      result.effectiveConstraints.push(effective);
      if (!merged.compatible) addCommandsFinding(result, 'error', 'commands.requirement_conflict', `Command ${id} 的 Project version constraints 不兼容。`, {
        commandId: id,
        projects: effective.projects,
        constraints: effective.constraints,
        provenance: effective.provenance,
        reason: 'command_requirement_conflict',
        suggestion: '调整对应 Project commands.yml，使版本要求存在可证明交集。',
      });
    }

    const sourceErrors = result.findings.some((finding: any) => finding.status === 'error');
    if (!sourceErrors) for (const effective of result.effectiveConstraints) {
      const record = commandsById.get(effective.id);
      if (!record) continue;
      const { command, sources } = record;
      const item: any = {
        id: command.id,
        name: command.name || command.id,
        executable: command.executable,
        purpose: command.purpose,
        description: command.description || null,
        installHint: command.installHint || null,
        status: 'ok',
        executablePath: null,
        version: command.version?.args && effective.constraint ? {
          constraint: effective.constraint,
          constraints: effective.constraints,
          args: command.version.args,
          current: null,
        } : null,
        message: '命令行工具可用。',
        difference: null,
        sources,
        requirements: effective.provenance,
        reason: 'command_available',
      };
      result.commands.push(item);
      result.observations.push(item);

      const executablePath = findExecutableOnPath(command.executable);
      item.executablePath = executablePath;
      if (!executablePath) {
        item.status = 'warning';
        item.reason = 'command_executable_missing';
        item.message = `当前本机找不到 executable：${command.executable}`;
        item.difference = { expected: command.executable, actual: null };
        addCommandsFinding(result, 'warning', 'commands.executable_missing', item.message, {
          path: sources[0],
          sources,
          commandId: command.id,
          executable: command.executable,
          installHint: command.installHint || null,
          reason: item.reason,
          provenance: effective.provenance,
          suggestion: command.installHint || '根据组织约定安装该命令行工具。',
        });
        continue;
      }

      if (!effective.constraint) continue;
      if (!command.version?.args) {
        item.status = 'warning';
        item.reason = 'command_version_probe_missing';
        item.message = `Command ${command.id} 有版本要求但 catalog definition 未声明 version probe args。`;
        addCommandsFinding(result, 'warning', 'commands.version_probe_missing', item.message, { commandId: command.id, sources, expected: effective.constraint, reason: 'command_version_probe_missing' });
        continue;
      }

      const versionCheck = probeCommandVersion(executablePath, command.version.args, { spawn });
      if (versionCheck.status === 'spawn-failed') {
        item.status = 'warning';
        item.reason = 'command_version_probe_spawn_failed';
        item.message = `无法启动 ${command.id} 的版本探测。`;
        item.difference = { expected: command.version.constraint, actual: null };
        addCommandsFinding(result, 'warning', 'commands.version_probe_spawn_failed', item.message, {
          path: sources[0],
          sources,
          commandId: command.id,
          executable: command.executable,
          executablePath,
          versionArgs: command.version.args,
          installHint: command.installHint || null,
          reason: item.reason,
          probeError: versionCheck.error,
          provenance: effective.provenance,
          suggestion: command.installHint || '请确认该命令行工具可执行入口和版本探测参数。',
        });
        continue;
      }
      const output = versionCheck.output;
      const currentVersion = versionCheck.currentVersion;
      if (versionCheck.status === 'unknown') {
        item.status = 'warning';
        item.reason = 'command_version_unknown';
        item.message = `无法从版本输出判断 ${command.id} 的版本。`;
        item.difference = { expected: command.version.constraint, actual: output || null };
        addCommandsFinding(result, 'warning', 'commands.version_unknown', item.message, {
          path: sources[0],
          sources,
          commandId: command.id,
          executable: command.executable,
          executablePath,
          versionArgs: command.version.args,
          installHint: command.installHint || null,
          reason: item.reason,
          provenance: effective.provenance,
          suggestion: command.installHint || '根据组织约定确认或升级该命令行工具。',
        });
        continue;
      }

      item.version.current = currentVersion.join('.');
      const satisfies = effective.constraints.every((raw: any) => versionSatisfies(currentVersion, parseVersionConstraint(raw)));
      if (!satisfies) {
        item.status = 'warning';
        item.reason = 'command_version_unsatisfied';
        item.message = `${command.id} 当前版本 ${item.version.current} 不满足 ${effective.constraint}。`;
        item.difference = { expected: effective.constraint, actual: item.version.current };
        addCommandsFinding(result, 'warning', 'commands.version_unsatisfied', item.message, {
          path: sources[0],
          sources,
          commandId: command.id,
          executable: command.executable,
          expected: effective.constraint,
          actual: item.version.current,
          installHint: command.installHint || null,
          reason: item.reason,
          provenance: effective.provenance,
          suggestion: command.installHint || '根据组织约定升级该命令行工具。',
        });
      }
    }

    finalizeCommandsCheckResult(result);
    return result;
  }

  function printCommandsCheckReport(result: any): any  {
    console.log(`Buildr commands check for ${result.targetRoot}`);
    console.log(`Status: ok=${result.summary.ok} warning=${result.summary.warning} error=${result.summary.error}`);
    console.log('');
    for (const manifest of result.manifests) console.log(`Manifest: ${manifest.path} exists=${manifest.exists} valid=${manifest.valid}`);
    if (result.manifests.length === 0) console.log(`Manifest: ${result.manifest.path} exists=${result.manifest.exists} valid=${result.manifest.valid}`);

    if (result.commands.length > 0) {
      console.log('');
      for (const command of result.commands) {
        console.log(`[${command.status}] ${command.id} (${command.executable}) [${command.sources.join(', ')}] - ${command.message}`);
        if (command.installHint && command.status !== 'ok') console.log(`  安装提示：${command.installHint}`);
      }
    }

    if (result.findings.length > 0) {
      console.log('');
      for (const finding of result.findings) {
        console.log(`[${finding.status}] ${finding.code} - ${finding.message}`);
        if (finding.suggestion) console.log(`  建议：${finding.suggestion}`);
      }
    }
  }

  function commandsCheck(args: any): any  {
    assertNoUnknownOptions(args, new Set(['--target', '--project', '--json']), new Set(['--json']));
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const json = hasFlag(args, '--json');
    const projects = repeatedOptionValues(args, '--project');
    const result = runCommandsCheck(targetRoot, { projects });
    if (json) {
      process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.commandsCheck, result), null, 2)}\n`);
    } else {
      printCommandsCheckReport(result);
    }
    process.exitCode = result.ok ? 0 : 1;
  }

  Object.assign(runtime, { PROJECT_COMMANDS_SCHEMA, normalizeCommandCollection, commandsManifestPath, projectCommandsPath, assertSafeCommandCollectionTarget, listCommandsManifestPaths, parseCommandsManifestYaml, parseProjectCommandsYaml, validateProjectCommandsDocument, renderProjectCommandsYaml, isPlainObject, validateCommandsManifest, renderCommandsManifestYaml, readCommandsManifestForWrite, writeCommandsManifest, parseVersionArgs, repeatedOptionValues, assertNoUnknownOptions, positionalArgs, buildCommandEntry, printCommandsMutationReceipt, commandsAddUnsafe, commandsAdd, commandsRemoveUnsafe, commandsRemove, parseVersionConstraint, parseVersion, compareVersions, versionSatisfies, intersectVersionConstraints, findExecutableOnPath, buildCommandProbeInvocation, probeCommandVersion, createCommandsCheckResult, addCommandsFinding, stableValue, commandDefinitionIdentity, normalizedCommandSignature, readRegisteredProjects, readProjectRequirementRecords, commandRemovalBlockers, finalizeCommandsCheckResult, runCommandsCheck, printCommandsCheckReport, commandsCheck });
  return runtime;
}
