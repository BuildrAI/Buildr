import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function registerDomainsRules(runtime) {
  const doctor = (...args) => runtime.doctor(...args);
  const isPlainObject = (...args) => runtime.isPlainObject(...args);
  const assertNoUnknownOptions = (...args) => runtime.assertNoUnknownOptions(...args);
  const positionalArgs = (...args) => runtime.positionalArgs(...args);
  const componentOwnerForMember = (...args) => runtime.componentOwnerForMember(...args);
  const isValidAssetId = (...args) => runtime.isValidAssetId(...args);
  const assertName = (...args) => runtime.assertName(...args);
  const normalizeRelativePathForBuildr = (...args) => runtime.normalizeRelativePathForBuildr(...args);
  const quoteYaml = (...args) => runtime.quoteYaml(...args);
  const optionValue = (...args) => runtime.optionValue(...args);
  const atomicWriteFile = (...args) => runtime.atomicWriteFile(...args);
  const parseYamlDocument = (...args) => runtime.parseYamlDocument(...args);
  const assertSafeAssetTarget = (...args) => runtime.assertSafeAssetTarget(...args);
  const withWorkspaceMutation = (...args) => runtime.withWorkspaceMutation(...args);
  const hasFlag = (...args) => runtime.hasFlag(...args);
  const toPosixRelative = (...args) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args) => runtime.existsDirectory(...args);
  const existsFile = (...args) => runtime.existsFile(...args);
  const rootRequiredBlockStatus = (...args) => runtime.rootRequiredBlockStatus(...args);
  const assertInitializedBuildrWorkspace = (...args) => runtime.assertInitializedBuildrWorkspace(...args);
  const addDoctorFinding = (...args) => runtime.addDoctorFinding(...args);

  function rulesManifestPath(scopeRoot) {
    return path.join(scopeRoot, 'rules', 'manifest.yml');
  }

  function parseRulesManifestYaml(content) {
    const manifest = parseYamlDocument(content, 'rules/manifest.yml');
    return manifest;
  }

  function renderRulesManifestYaml(manifest) {
    const lines = ['schemaVersion: buildr.rules/v1'];
    if (!manifest.rules || manifest.rules.length === 0) {
      lines.push('rules: []');
      return `${lines.join('\n')}\n`;
    }
    lines.push('rules:');
    for (const rule of manifest.rules) {
      lines.push(`  - id: ${quoteYaml(rule.id)}`);
      for (const key of ['source', 'path', 'description']) {
        if (rule[key] !== undefined) lines.push(`    ${key}: ${quoteYaml(rule[key])}`);
      }
      if (rule.enabled !== undefined) lines.push(`    enabled: ${quoteYaml(Boolean(rule.enabled))}`);
      if (rule.required !== undefined) lines.push(`    required: ${quoteYaml(Boolean(rule.required))}`);
      for (const key of ['state', 'reason']) {
        if (rule[key] !== undefined) lines.push(`    ${key}: ${quoteYaml(rule[key])}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  function validateRulesManifest(manifest) {
    const errors = [];
    if (manifest.schemaVersion !== 'buildr.rules/v1') {
      errors.push('rules manifest schemaVersion must be buildr.rules/v1.');
    }
    if (!Array.isArray(manifest.rules)) {
      errors.push('rules manifest must declare rules as an array.');
      return errors;
    }
    const ids = new Set();
    const allowedKeys = new Set(['id', 'source', 'path', 'description', 'enabled', 'required', 'state', 'reason']);
    for (const [index, rule] of manifest.rules.entries()) {
      const label = `rules[${index}]`;
      if (!isPlainObject(rule)) {
        errors.push(`${label} must be an object.`);
        continue;
      }
      for (const key of Object.keys(rule)) {
        if (!allowedKeys.has(key)) errors.push(`${label}.${key} is not a supported rules manifest field.`);
      }
      if (!isValidAssetId(rule.id)) {
        errors.push(`${label}.id must contain only letters, digits, dots, underscores, or dashes.`);
      } else if (ids.has(rule.id)) {
        errors.push(`Duplicate rule id: ${rule.id}.`);
      } else {
        ids.add(rule.id);
      }
      if (!['buildr', 'workspace', 'project', 'service'].includes(rule.source)) {
        errors.push(`${label}.source must be buildr, workspace, project, or service.`);
      }
      if (!rule.path || typeof rule.path !== 'string') {
        errors.push(`${label}.path is required.`);
      } else {
        normalizeRelativePathForBuildr(rule.path, `${label}.path must stay relative: ${rule.path}`);
        if (!rule.path.endsWith('.md')) errors.push(`${label}.path must point to a Markdown file.`);
      }
      if (!rule.description || typeof rule.description !== 'string') {
        errors.push(`${label}.description is required and must describe when to read the rule.`);
      }
      if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
        errors.push(`${label}.enabled must be a boolean.`);
      }
      if (rule.required !== undefined && typeof rule.required !== 'boolean') {
        errors.push(`${label}.required must be a boolean.`);
      }
      if (rule.state !== undefined && !['installed', 'modified', 'uninstalled', 'missing'].includes(rule.state)) {
        errors.push(`${label}.state must be installed, modified, uninstalled, or missing.`);
      }
    }
    return errors;
  }

  function readRulesManifestForWrite(scopeRoot) {
    const manifestPath = rulesManifestPath(scopeRoot);
    if (!existsFile(manifestPath)) return { schemaVersion: 'buildr.rules/v1', rules: [] };
    const manifest = parseRulesManifestYaml(fs.readFileSync(manifestPath, 'utf8'));
    const validationErrors = validateRulesManifest(manifest);
    if (validationErrors.length > 0) {
      throw new Error(`rules/manifest.yml is invalid:\n- ${validationErrors.join('\n- ')}`);
    }
    return manifest;
  }

  function writeRulesManifest(scopeRoot, manifest) {
    const manifestPath = rulesManifestPath(scopeRoot);
    atomicWriteFile(manifestPath, renderRulesManifestYaml(manifest), 'utf8');
    return manifestPath;
  }

  function resolveRootRulesScope(args) {
    const scope = optionValue(args, '--scope', '.');
    if (scope !== '.') {
      throw new Error(`rules add/remove currently support only root scope ".". Project rules are maintained through projects/<project>/AGENTS.md: ${scope}`);
    }
  }

  function normalizeRootRulePath(targetRoot, rulePath) {
    const normalized = normalizeRelativePathForBuildr(rulePath, `Rule path must stay relative: ${rulePath}`).split(path.sep).join('/');
    if (!normalized.startsWith('rules/')) {
      throw new Error(`Rule path must be under rules/: ${normalized}`);
    }
    if (normalized === 'rules/manifest.yml') {
      throw new Error('Rule path must point to a Markdown rule file, not rules/manifest.yml.');
    }
    if (normalized.startsWith('rules/buildr/')) {
      throw new Error('rules/buildr/ is reserved for Buildr-managed Rules. Use a user-managed path under rules/.');
    }
    const absolute = path.resolve(targetRoot, normalized);
    const relative = path.relative(targetRoot, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Rule path must stay inside workspace: ${normalized}`);
    }
    if (!normalized.endsWith('.md')) {
      throw new Error(`Rule path must point to a Markdown file: ${normalized}`);
    }
    return normalized;
  }

  function buildRuleEntry(id, args, targetRoot) {
    assertName(id, 'Rule id');
    const description = optionValue(args, '--description', null);
    if (!description) throw new Error('Missing required option: --description');
    const rulePath = normalizeRootRulePath(targetRoot, optionValue(args, '--path', `rules/${id}.md`));
    if (!existsFile(path.join(targetRoot, rulePath))) {
      throw new Error(`rules add registers an existing root Rule file. Create the file first: ${rulePath}`);
    }
    const entry = {
      id,
      source: 'workspace',
      path: rulePath,
      description,
      enabled: true,
      required: false,
      state: 'installed',
    };
    const errors = validateRulesManifest({ schemaVersion: 'buildr.rules/v1', rules: [entry] });
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return entry;
  }

  function printRulesMutationReceipt(action, targetRoot, id, updatedPaths, nextAction) {
    console.log(`已${action}规则资产：${id}`);
    console.log('已更新 Buildr 源资产：');
    for (const file of updatedPaths) console.log(`  ${toPosixRelative(targetRoot, file)}`);
    console.log('下一步：');
    console.log(`  ${nextAction}`);
  }

  function rulesAddUnsafe(args) {
    const allowedFlags = new Set(['--target', '--scope', '--path', '--description', '--replace']);
    assertNoUnknownOptions(args, allowedFlags, new Set(['--replace']));
    resolveRootRulesScope(args);
    const [id] = positionalArgs(args);
    if (!id) throw new Error('Missing rule id');
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    assertInitializedBuildrWorkspace(targetRoot);

    const manifest = readRulesManifestForWrite(targetRoot);
    const entry = buildRuleEntry(id, args, targetRoot);
    const replace = hasFlag(args, '--replace');
    const existingIndex = manifest.rules.findIndex((rule) => rule.id === id);
    if (existingIndex !== -1 && !replace) {
      throw new Error(`Rule already exists in rules/manifest.yml: ${id}. Use --replace to replace the whole entry.`);
    }
    if (existingIndex === -1) {
      manifest.rules.push(entry);
    } else {
      const existing = manifest.rules[existingIndex];
      if (existing.source === 'buildr' && existing.required === true) {
        throw new Error(`Required Buildr Rule cannot be replaced through rules add: ${id}`);
      }
      manifest.rules[existingIndex] = entry;
    }

    const manifestPath = writeRulesManifest(targetRoot, manifest);
    printRulesMutationReceipt(
      existingIndex === -1 ? '添加' : '替换',
      targetRoot,
      id,
      [manifestPath],
      '运行 buildr doctor --agent <agent> --target <dir> --json 复查；需要 Agent runtime 投射时再按当前 adapter 执行 rules render、runtime check 或 sync。'
    );
  }

  function rulesAdd(args) {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    return withWorkspaceMutation(targetRoot, 'rules.add', [path.join(targetRoot, 'rules')], () => rulesAddUnsafe(args));
  }

  function rulesRemoveUnsafe(args) {
    const allowedFlags = new Set(['--target', '--scope', '--keep-file']);
    assertNoUnknownOptions(args, allowedFlags, new Set(['--keep-file']));
    resolveRootRulesScope(args);
    const [id] = positionalArgs(args);
    if (!id) throw new Error('Missing rule id');
    assertName(id, 'Rule id');
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    assertInitializedBuildrWorkspace(targetRoot);

    const manifest = readRulesManifestForWrite(targetRoot);
    const existingIndex = manifest.rules.findIndex((rule) => rule.id === id);
    if (existingIndex === -1) {
      throw new Error(`Rule not found in rules/manifest.yml: ${id}`);
    }
    const removed = manifest.rules[existingIndex];
    const owner = componentOwnerForMember(targetRoot, removed.path);
    if (owner) throw new Error(`Rule is managed by Component ${owner}: ${removed.path}. Use buildr component lifecycle commands.`);
    manifest.rules.splice(existingIndex, 1);
    if (removed.source === 'buildr' && removed.required === true) {
      throw new Error(`Required Buildr Rule cannot be removed through rules remove: ${id}`);
    }
    if (removed.source === 'buildr') {
      throw new Error(`Buildr-managed Rule cannot be removed through rules remove: ${id}. Use buildr builtin uninstall for optional builtins.`);
    }

    const updatedPaths = [];
    const manifestPath = writeRulesManifest(targetRoot, manifest);
    updatedPaths.push(manifestPath);
    if (!hasFlag(args, '--keep-file')) {
      const rulePath = normalizeRootRulePath(targetRoot, removed.path);
      const absoluteRulePath = path.join(targetRoot, rulePath);
      if (existsFile(absoluteRulePath)) {
        assertSafeAssetTarget(targetRoot, absoluteRulePath, path.join(targetRoot, 'rules'), 'Rule delete target');
        fs.rmSync(absoluteRulePath, { force: true });
        updatedPaths.push(absoluteRulePath);
      }
    }
    printRulesMutationReceipt(
      '删除',
      targetRoot,
      id,
      updatedPaths,
      hasFlag(args, '--keep-file')
        ? '运行 buildr doctor --agent <agent> --target <dir> --json；保留的规则文件会作为未登记文件提示，后续可重新注册、移动归档或删除。'
        : '运行 buildr doctor --agent <agent> --target <dir> --json 复查；需要 Agent runtime 投射时再按当前 adapter 执行 rules render、runtime check 或 sync。'
    );
  }

  function rulesRemove(args) {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    return withWorkspaceMutation(targetRoot, 'rules.remove', [path.join(targetRoot, 'rules')], () => rulesRemoveUnsafe(args));
  }

  function listMarkdownFiles(rootDir) {
    if (!existsDirectory(rootDir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(rootDir).sort()) {
      const entryPath = path.join(rootDir, entry);
      if (existsDirectory(entryPath)) {
        files.push(...listMarkdownFiles(entryPath));
      } else if (entry.endsWith('.md') && existsFile(entryPath)) {
        files.push(entryPath);
      }
    }
    return files;
  }

  function diagnoseRules(result, targetRoot) {
    const manifestPath = rulesManifestPath(targetRoot);
    const rules = {
      manifest: {
        path: 'rules/manifest.yml',
        exists: existsFile(manifestPath),
        valid: false,
        schemaVersion: null,
      },
      entries: [],
    };
    result.rules = rules;

    const requiredStatus = rootRequiredBlockStatus(targetRoot);
    result.workspace.requiredBlock = requiredStatus;
    if (!requiredStatus.valid) {
      addDoctorFinding(result, 'warning', 'rules.required_block_invalid', '根 AGENTS.md 缺少或破坏 Buildr required block。', {
        path: 'AGENTS.md',
        suggestion: '运行 buildr update 或 buildr sync 恢复 required block；该操作只修复 Buildr block，不覆盖用户正文。',
      });
    }

    if (!rules.manifest.exists) {
      if (result.workspace?.initialized) {
        addDoctorFinding(result, 'warning', 'rules.manifest_missing', '规则清单不存在：rules/manifest.yml', {
          path: rules.manifest.path,
          suggestion: '运行 buildr sync <agent> 同步 Buildr 内置规则清单和当前 Agent runtime。',
        });
      }
      return;
    }

    let manifest;
    try {
      manifest = parseRulesManifestYaml(fs.readFileSync(manifestPath, 'utf8'));
      rules.manifest.schemaVersion = manifest.schemaVersion;
      const validationErrors = validateRulesManifest(manifest);
      if (validationErrors.length > 0) {
        for (const message of validationErrors) {
          addDoctorFinding(result, 'warning', 'rules.manifest_invalid', message, {
            path: rules.manifest.path,
            suggestion: '修复 rules/manifest.yml；规则 description 必须说明语义边界和用途，用于 Agent 判断相关规则。',
          });
        }
        return;
      }
    } catch (error) {
      addDoctorFinding(result, 'warning', 'rules.manifest_invalid', `规则清单不可解析：${error.message}`, {
        path: rules.manifest.path,
        suggestion: '修复 rules/manifest.yml 后重新运行 doctor。',
      });
      return;
    }
    rules.manifest.valid = true;

    const registeredPaths = new Set();
    for (const rule of manifest.rules) {
      const exists = existsFile(path.join(targetRoot, rule.path));
      registeredPaths.add(rule.path);
      const status = rule.enabled === false || rule.state === 'uninstalled'
        ? 'uninstalled'
        : exists ? 'installed' : 'missing';
      rules.entries.push({ id: rule.id, source: rule.source, path: rule.path, description: rule.description, enabled: rule.enabled !== false, required: rule.required === true, state: rule.state || status, exists });
      if (!exists && rule.state !== 'uninstalled' && rule.enabled !== false) {
        addDoctorFinding(result, rule.required ? 'warning' : 'warning', 'rules.file_missing', `规则清单登记的文件缺失：${rule.id}`, {
          path: rule.path,
          suggestion: rule.required ? '运行 buildr update 或 buildr sync 恢复 required 规则。' : '确认是否要恢复该规则文件；不再需要时可运行 buildr rules remove <id> --keep-file 取消登记，或手工修复 rules/manifest.yml。',
        });
      }
    }

    const rulesRoot = path.join(targetRoot, 'rules');
    for (const file of listMarkdownFiles(rulesRoot)) {
      const relative = toPosixRelative(targetRoot, file);
      if (!registeredPaths.has(relative)) {
        addDoctorFinding(result, 'warning', relative.startsWith('rules/buildr/') ? 'rules.buildr_unregistered' : 'rules.unregistered', `规则文件未登记到 rules/manifest.yml：${relative}`, {
          path: relative,
          suggestion: relative.startsWith('rules/buildr/')
            ? '运行 buildr update 或 buildr sync 恢复 Buildr 内置规则登记。'
            : `运行 buildr rules add <id> --path ${relative} --description <text> 注册该规则，或移动/删除该文件。`,
        });
      }
    }
  }

  Object.assign(runtime, { rulesManifestPath, parseRulesManifestYaml, renderRulesManifestYaml, validateRulesManifest, readRulesManifestForWrite, writeRulesManifest, resolveRootRulesScope, normalizeRootRulePath, buildRuleEntry, printRulesMutationReceipt, rulesAddUnsafe, rulesAdd, rulesRemoveUnsafe, rulesRemove, listMarkdownFiles, diagnoseRules });
  return runtime;
}
