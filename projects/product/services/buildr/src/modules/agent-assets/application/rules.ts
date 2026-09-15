import fs from 'node:fs';
import path from 'node:path';
import { createRuleManifestRepository } from '../persistence/rule-manifest-repository.ts';

export interface RulesDependencies {
  isPlainObject: ReturnType<typeof import('./commands.ts').registerDomainsCommands>['isPlainObject'];
  componentOwnerForMember: ReturnType<typeof import('./components.ts').registerDomainsComponents>['componentOwnerForMember'];
  isValidAssetId: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['isValidAssetId'];
  assertName: ReturnType<typeof import('./runtime.ts').registerDomainsRuntime>['assertName'];
  normalizeRelativePathForBuildr: ReturnType<typeof import('./skills.ts').registerDomainsSkills>['normalizeRelativePathForBuildr'];
  quoteYaml: typeof import('../../../infrastructure/filesystem/yaml.ts').quoteYaml;
  atomicWriteFile: typeof import('../../../infrastructure/filesystem/atomic-files.ts').atomicWriteFile;
  parseYamlDocument: typeof import('../../../infrastructure/filesystem/yaml.ts').parseYamlDocument;
  assertSafeAssetTarget: (targetRoot: string, target: string, containerRoot: string, label?: string) => string;
  withWorkspaceMutation: (...args: any[]) => any;
  toPosixRelative: (...args: any[]) => any;
  existsDirectory: (file: string) => boolean;
  existsFile: (file: string) => boolean;
  rootRequiredBlockStatus: typeof import('../../../infrastructure/filesystem/required-block.ts').rootRequiredBlockStatus;
  assertInitializedBuildrWorkspace: typeof import('../../../infrastructure/filesystem/workspace-identity.ts').assertInitializedBuildrWorkspace;
  addDoctorFinding: typeof import('../../../infrastructure/contracts/diagnostic-finding.ts').addDoctorFinding;
}

export function registerDomainsRules(dependencies: RulesDependencies) {
  const {
    isPlainObject,
    componentOwnerForMember,
    isValidAssetId,
    assertName,
    normalizeRelativePathForBuildr,
    quoteYaml,
    atomicWriteFile,
    parseYamlDocument,
    assertSafeAssetTarget,
    withWorkspaceMutation,
    toPosixRelative,
    existsDirectory,
    existsFile,
    rootRequiredBlockStatus,
    assertInitializedBuildrWorkspace,
    addDoctorFinding,
  } = dependencies;

  const { rulesManifestPath, parseRulesManifestYaml, renderRulesManifestYaml, validateRulesManifest, readRulesManifestForWrite, writeRulesManifest } = createRuleManifestRepository({
    atomicWriteFile, existsFile, isPlainObject, isValidAssetId, normalizeRelativePathForBuildr, parseYamlDocument, quoteYaml,
  });

  function resolveRootRulesScope(scope: any = '.'): any  {
    if (scope !== '.') {
      throw new Error(`rules add/remove currently support only root scope ".". Project rules are maintained through projects/<project>/AGENTS.md: ${scope}`);
    }
  }

  function normalizeRootRulePath(targetRoot: any, rulePath: any): any  {
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

  function buildRuleEntry(id: any, input: any, targetRoot: any): any  {
    assertName(id, 'Rule id');
    const description = input.description;
    if (!description) throw new Error('Missing required option: --description');
    const rulePath = normalizeRootRulePath(targetRoot, input.path || `rules/${id}.md`);
    if (!existsFile(path.join(targetRoot, rulePath))) {
      throw new Error(`rules add registers an existing root Rule file. Create the file first: ${rulePath}`);
    }
    const entry: any = {
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

  function rulesAddUnsafe(input: any): any  {
    const { id, targetRoot, replace = false } = input;
    resolveRootRulesScope(input.scope);
    assertInitializedBuildrWorkspace(targetRoot);

    const manifest = readRulesManifestForWrite(targetRoot);
    const entry = buildRuleEntry(id, input, targetRoot);
    const existingIndex = manifest.rules.findIndex((rule: any) => rule.id === id);
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
    return { action: existingIndex === -1 ? '添加' : '替换', targetRoot, id, updatedPaths: [manifestPath], nextAction: '运行 buildr doctor --agent <agent> --target <dir> --json 复查；需要 Agent runtime 投射时再按当前 adapter 执行 rules render、runtime check 或 sync。' };
  }

  function rulesAdd(input: any): any  {
    return withWorkspaceMutation(input.targetRoot, 'rules.add', [path.join(input.targetRoot, 'rules')], () => rulesAddUnsafe(input));
  }

  function rulesRemoveUnsafe(input: any): any  {
    const { id, targetRoot, keepFile = false } = input;
    resolveRootRulesScope(input.scope);
    assertName(id, 'Rule id');
    assertInitializedBuildrWorkspace(targetRoot);

    const manifest = readRulesManifestForWrite(targetRoot);
    const existingIndex = manifest.rules.findIndex((rule: any) => rule.id === id);
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

    const updatedPaths: any[] = [];
    const manifestPath = writeRulesManifest(targetRoot, manifest);
    updatedPaths.push(manifestPath);
    if (!keepFile) {
      const rulePath = normalizeRootRulePath(targetRoot, removed.path);
      const absoluteRulePath = path.join(targetRoot, rulePath);
      if (existsFile(absoluteRulePath)) {
        assertSafeAssetTarget(targetRoot, absoluteRulePath, path.join(targetRoot, 'rules'), 'Rule delete target');
        fs.rmSync(absoluteRulePath, { force: true });
        updatedPaths.push(absoluteRulePath);
      }
    }
    return {
      action: '删除', targetRoot, id, updatedPaths,
      nextAction: keepFile
        ? '运行 buildr doctor --agent <agent> --target <dir> --json；保留的规则文件会作为未登记文件提示，后续可重新注册、移动归档或删除。'
        : '运行 buildr doctor --agent <agent> --target <dir> --json 复查；需要 Agent runtime 投射时再按当前 adapter 执行 rules render、runtime check 或 sync。',
    };
  }

  function rulesRemove(input: any): any  {
    return withWorkspaceMutation(input.targetRoot, 'rules.remove', [path.join(input.targetRoot, 'rules')], () => rulesRemoveUnsafe(input));
  }

  function listMarkdownFiles(rootDir: any): any  {
    if (!existsDirectory(rootDir)) return [];
    const files: any[] = [];
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

  function diagnoseRules(result: any, targetRoot: any): any  {
    const manifestPath = rulesManifestPath(targetRoot);
    const rules: any = {
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
    } catch (error: any) {
      addDoctorFinding(result, 'warning', 'rules.manifest_invalid', `规则清单不可解析：${error.message}`, {
        path: rules.manifest.path,
        suggestion: '修复 rules/manifest.yml 后重新运行 doctor。',
      });
      return;
    }
    rules.manifest.valid = true;

    const registeredPaths: any = new Set();
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
      // Retired Core is diagnosed by the receipt-aware retirement reader, not
      // as an installable builtin that sync should restore.
      if (relative === 'rules/buildr/core.md') continue;
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

  return Object.freeze({
    rulesManifestPath,
    parseRulesManifestYaml,
    renderRulesManifestYaml,
    readRulesManifestForWrite,
    writeRulesManifest,
    rulesAdd,
    rulesRemove,
    diagnoseRules,
  });
}
