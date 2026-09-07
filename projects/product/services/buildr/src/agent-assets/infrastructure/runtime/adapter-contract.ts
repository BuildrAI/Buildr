import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  runtimeFileMatches,
  sha256Integrity,
  runtimeWriteBuffer,
  runtimeWriteMode,
  runtimeWriteModeMatches,
} from './skills/projection-files.ts';

export const REQUIRED_RENDER_CAPABILITIES = Object.freeze([
  'rules-entry',
  'product-buildr-skill',
  'workspace-project-skills',
  'skill-install-plans',
  'runtime-check',
]);

export const SKILL_PUBLICATION_FORMATS = Object.freeze(['openai-skill-metadata']);

export const ADAPTER_TRAIT_CATALOG = Object.freeze({
  rules: Object.freeze(['native-recursive', 'native-root', 'reference-bridge', 'vendor-rule-files']),
  skills: Object.freeze(['agents-compatible', 'vendor-root']),
  surfaces: Object.freeze(['ide', 'cli', 'desktop', 'cloud']),
  activation: Object.freeze(['immediate', 'path-read', 'session-start', 'explicit-reload']),
  checker: Object.freeze(['projection']),
  environmentProbe: Object.freeze(['none', 'command', 'manual']),
});

export const BUILTIN_ADAPTER_IMPLEMENTATIONS = Object.freeze({
  rules: Object.freeze(['native-recursive', 'reference-bridge', 'vendor-rule-files']),
  skills: Object.freeze(['filesystem-skills']),
  checker: Object.freeze(['projection']),
});

export const UNSUPPORTED_AGENT_GUIDANCE = Object.freeze({
  message: 'Buildr 暂不支持当前 Agent runtime 的自动渲染。',
  nextStep: '请联系 Buildr 作者反馈该 Agent。',
  mustNotUseFallbackAdapter: true,
});

const AGENT_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function selectPlatformEnvironmentProbe({ platform = process.platform, command, guidance }: any): any  {
  if (platform === 'darwin') return structuredClone(command);
  return { kind: 'manual', guidance };
}

function freeze(value: any): any  {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function planFromTraits(context: any, traits: any): any  {
  const rules = traits.rules.kind === 'native-recursive'
    ? {
        writes: [],
        removals: [],
        nativeAssets: context.rules.nativeAssets,
        actions: [],
      }
    : context.rules;
  return createRuntimePlan({
    adapterId: context.adapterId,
    targetRoot: context.targetRoot,
    scope: context.scope,
    writes: [...rules.writes, ...context.skills.writes],
    nativeAssets: rules.nativeAssets,
    removals: [...rules.removals, ...context.skills.removals],
    capabilityEvidence: REQUIRED_RENDER_CAPABILITIES.map((capability: any) => ({
      capability,
      supported: true,
      adapterId: context.adapterId,
    })),
    findings: [...context.findings],
    repairs: [...context.repairs],
    warnings: [...context.warnings],
    ruleActions: rules.actions,
  });
}

function isSafeRuntimeRoot(value: any): any  {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  return normalized !== '.' && normalized !== '..' && !normalized.startsWith('../') && normalized === value.replaceAll('\\', '/').replace(/\/$/, '');
}

function isSafeSkillRelativePath(value: any): any  {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) return false;
  const posix = value.replaceAll('\\', '/');
  const normalized = path.posix.normalize(posix);
  return normalized !== '.' && normalized !== '..' && !normalized.startsWith('../') && normalized === posix.replace(/\/$/, '');
}

function validateSkillPublicationExtensions(skills: any, label: any, errors: any): any  {
  if (skills.publicationExtensions === undefined) return;
  if (!Array.isArray(skills.publicationExtensions)) {
    errors.push(`${label} publicationExtensions must be an array`);
    return;
  }
  const paths: any = new Set();
  for (const [index, extension] of skills.publicationExtensions.entries()) {
    const extensionLabel = `${label} publicationExtensions[${index}]`;
    if (!isSafeSkillRelativePath(extension?.path)) errors.push(`${extensionLabel} path is unsafe: ${extension?.path || '<missing>'}`);
    if (!SKILL_PUBLICATION_FORMATS.includes(extension?.format)) errors.push(`${extensionLabel} format is invalid: ${extension?.format || '<missing>'}`);
    if (paths.has(extension?.path)) errors.push(`${label} publicationExtensions contains duplicate path: ${extension?.path}`);
    paths.add(extension?.path);
  }
}

function normalizeSkillDestinations(skills: any): any  {
  const workspace = skills.destinations?.workspace || { supported: true, root: skills.root };
  const user = skills.destinations?.user || { supported: true, root: skills.root };
  return {
    workspace,
    user,
    discovery: skills.discovery || {
      evidence: 'partial',
      roots: [
        { source: 'workspace', destination: 'workspace' },
        { source: 'user', destination: 'user' },
      ],
      opaqueSources: ['admin', 'system', 'plugin'],
      precedence: 'not-guaranteed',
    },
  };
}

function normalizeImplementationCatalog(value: any = {}): any  {
  return {
    rules: new Set(value.rules || BUILTIN_ADAPTER_IMPLEMENTATIONS.rules),
    skills: new Set(value.skills || BUILTIN_ADAPTER_IMPLEMENTATIONS.skills),
    checker: new Set(value.checker || BUILTIN_ADAPTER_IMPLEMENTATIONS.checker),
  };
}

function validateEnvironmentProbe(probe: any, label: any, errors: any): any  {
  if (!probe || !ADAPTER_TRAIT_CATALOG.environmentProbe.includes(probe.kind)) {
    errors.push(`${label} kind is invalid: ${probe?.kind || '<missing>'}`);
    return;
  }
  if (probe.kind === 'command') {
    if (typeof probe.executable !== 'string' || !AGENT_ID_PATTERN.test(probe.executable)) errors.push(`${label} command executable must be a static command name`);
    if (!Array.isArray(probe.args) || probe.args.some((item: any) => typeof item !== 'string')) errors.push(`${label} command args must be an array of strings`);
    if (!Number.isInteger(probe.timeoutMs) || probe.timeoutMs < 100 || probe.timeoutMs > 10000) errors.push(`${label} command timeoutMs must be between 100 and 10000`);
  }
  if (probe.kind === 'manual' && !probe.guidance) errors.push(`${label} manual guidance is required`);
}

function validateAdapterTraits(descriptor: any, options: any = {}): any  {
  const errors: any[] = [];
  const traits = descriptor?.traits;
  const implementations = normalizeImplementationCatalog(options.implementations);
  if (!traits || typeof traits !== 'object') return [`adapter ${descriptor?.id || '<missing>'} traits are required`];

  const rules = traits.rules;
  if (!rules || !ADAPTER_TRAIT_CATALOG.rules.includes(rules.kind)) errors.push(`adapter ${descriptor.id} rules trait is invalid: ${rules?.kind || '<missing>'}`);
  if (!rules?.implementation || !implementations.rules.has(rules.implementation)) errors.push(`adapter ${descriptor.id} has no registered rules implementation: ${rules?.implementation || '<missing>'}`);
  if (rules?.kind === 'native-recursive' && rules.implementation !== 'native-recursive') errors.push(`adapter ${descriptor.id} native-recursive rules must use native-recursive implementation`);
  if (rules?.kind === 'native-root' && rules.scopeCoverage !== 'recursive') errors.push(`adapter ${descriptor.id} native-root rules do not cover recursive scope`);
  if (['reference-bridge', 'vendor-rule-files'].includes(rules?.kind) && !rules.targetPattern) errors.push(`adapter ${descriptor.id} rendered rules targetPattern is required`);
  if (rules?.kind === 'reference-bridge' && !['per-source', 'root-index'].includes(rules.placement || 'per-source')) errors.push(`adapter ${descriptor.id} reference bridge placement is invalid: ${rules?.placement}`);
  if (rules?.kind === 'vendor-rule-files' && !['cursor-mdc', 'qoder-markdown', 'trae-markdown'].includes(rules.format)) errors.push(`adapter ${descriptor.id} vendor rules format is invalid: ${rules?.format || '<missing>'}`);
  if (rules?.maxChars !== undefined && (!Number.isInteger(rules.maxChars) || rules.maxChars < 256)) errors.push(`adapter ${descriptor.id} rules maxChars must be an integer of at least 256`);

  const skills = traits.skills;
  if (!skills || !ADAPTER_TRAIT_CATALOG.skills.includes(skills.kind)) errors.push(`adapter ${descriptor.id} skills trait is invalid: ${skills?.kind || '<missing>'}`);
  if (!skills?.implementation || !implementations.skills.has(skills.implementation)) errors.push(`adapter ${descriptor.id} has no registered skills implementation: ${skills?.implementation || '<missing>'}`);
  if (!isSafeRuntimeRoot(skills?.root)) errors.push(`adapter ${descriptor.id} skills root is unsafe: ${skills?.root || '<missing>'}`);
  if (skills?.kind === 'agents-compatible' && skills.root !== '.agents') errors.push(`adapter ${descriptor.id} agents-compatible skills root must be .agents`);
  validateSkillPublicationExtensions(skills || {}, `adapter ${descriptor.id} skills`, errors);
  const destinations = normalizeSkillDestinations(skills || {});
  for (const destination of ['workspace', 'user']) {
    const entry = destinations[destination];
    if (entry.supported !== false && !isSafeRuntimeRoot(entry.root)) errors.push(`adapter ${descriptor.id} ${destination} Skill destination root is unsafe: ${entry.root || '<missing>'}`);
  }
  if (!['complete', 'partial'].includes(destinations.discovery.evidence)) errors.push(`adapter ${descriptor.id} Skill discovery evidence must be complete or partial`);
  if (!Array.isArray(destinations.discovery.roots)) errors.push(`adapter ${descriptor.id} Skill discovery roots must be an array`);

  if (!Array.isArray(traits.surfaces) || traits.surfaces.length === 0) errors.push(`adapter ${descriptor.id} surfaces are required`);
  for (const surface of traits.surfaces || []) {
    if (!surface || !ADAPTER_TRAIT_CATALOG.surfaces.includes(surface.kind)) errors.push(`adapter ${descriptor.id} surface is invalid: ${surface?.kind || '<missing>'}`);
  }

  const activation = traits.activation;
  for (const asset of ['rules', 'skills']) {
    if (!ADAPTER_TRAIT_CATALOG.activation.includes(activation?.[asset])) errors.push(`adapter ${descriptor.id} ${asset} activation is invalid: ${activation?.[asset] || '<missing>'}`);
  }
  if ([activation?.rules, activation?.skills].includes('explicit-reload') && !activation.reloadGuidance) errors.push(`adapter ${descriptor.id} explicit-reload guidance is required`);

  const checker = traits.checker;
  if (!checker || !ADAPTER_TRAIT_CATALOG.checker.includes(checker.kind)) errors.push(`adapter ${descriptor.id} checker trait is invalid: ${checker?.kind || '<missing>'}`);
  if (!checker?.implementation || !implementations.checker.has(checker.implementation)) errors.push(`adapter ${descriptor.id} has no registered checker implementation: ${checker?.implementation || '<missing>'}`);
  validateEnvironmentProbe(checker?.installationProbe, `adapter ${descriptor.id} installation probe`, errors);
  validateEnvironmentProbe(checker?.versionProbe, `adapter ${descriptor.id} version probe`, errors);
  if (checker?.prerequisites !== undefined && !Array.isArray(checker.prerequisites)) errors.push(`adapter ${descriptor.id} checker prerequisites must be an array`);
  for (const prerequisite of checker?.prerequisites || []) {
    if (!prerequisite?.code || !prerequisite?.message || !prerequisite?.guidance) errors.push(`adapter ${descriptor.id} checker prerequisite must declare code, message, and guidance`);
  }
  return errors;
}

function ruleCapability(traits: any): any  {
  const rules = traits.rules;
  const native = rules.kind === 'native-recursive';
  return {
    supported: true,
    mode: native ? 'native' : 'rendered',
    scopeSyntax: 'workspace-relative-path',
    sourceDiscovery: { pattern: '**/AGENTS.md', mode: 'recursive-scope', includesAncestors: true },
    projection: native ? { mode: 'native' } : { mode: 'rendered', targetPattern: rules.targetPattern },
    writesFiles: !native,
    ...(native ? { sourceAssets: ['**/AGENTS.md'] } : { targets: [rules.targetPattern] }),
  };
}

function renderCapabilities(traits: any): any  {
  const root = traits.skills.root;
  return {
    'rules-entry': ruleCapability(traits),
    'product-buildr-skill': { supported: true, mode: 'install', writesFiles: true, targets: [`${root}/skills/buildr/SKILL.md`] },
    'workspace-project-skills': { supported: true, mode: 'rendered', writesFiles: true, targets: [`${root}/skills/<skill>/SKILL.md`] },
    'skill-install-plans': { supported: true, mode: 'plan', writesFiles: true, targets: [`${root}/buildr/skill-install-plans/<skill>.md`] },
    'runtime-check': {
      supported: true,
      mode: 'diagnostic',
      writesFiles: false,
      projection: traits.checker.kind,
      installationProbe: traits.checker.installationProbe.kind,
      versionProbe: traits.checker.versionProbe.kind,
    },
  };
}

function runtimeTargets(traits: any): any  {
  const rules = traits.rules.kind === 'native-recursive'
    ? ['AGENTS.md']
    : [traits.rules.targetPattern.replace('<source-dir>/', '').replace('<workspace-root>/', '')];
  return [...rules, `${traits.skills.root}/skills/`, `${traits.skills.root}/buildr/skill-install-plans/`];
}

export function createRuntimeAdapterDescriptor(value: any, options: any = {}): any  {
  value = structuredClone(value);
  value.traits.skills.destinations = normalizeSkillDestinations(value.traits.skills);
  const traitErrors = validateAdapterTraits(value, options);
  if (traitErrors.length > 0) throw new Error(`Invalid runtime adapter descriptor ${value.id || '<missing>'}:\n- ${traitErrors.join('\n- ')}`);
  const traits = freeze(structuredClone(value.traits));
  const descriptor: any = {
    id: value.id,
    displayName: value.displayName,
    traits,
    implementation: {
      rules: traits.rules.implementation,
      skills: traits.skills.implementation,
      checker: traits.checker.implementation,
    },
    runtimeTargets: runtimeTargets(traits),
    renderCapabilities: renderCapabilities(traits),
    recommendedCommands: value.recommendedCommands,
    evidence: value.evidence || {},
    planRuntime(context: any): any  { return planFromTraits(context, traits); },
  };
  const errors = validateAdapterDescriptor(descriptor, options);
  if (errors.length > 0) throw new Error(`Invalid runtime adapter descriptor ${value.id || '<missing>'}:\n- ${errors.join('\n- ')}`);
  return freeze(descriptor);
}

export function skillDestinationRoot(adapterOrId: any, destination: any, workspaceRoot: any, options: any = {}): any  {
  const adapter = typeof adapterOrId === 'string' ? getRuntimeAdapter(adapterOrId) : adapterOrId;
  if (!['workspace', 'user'].includes(destination)) throw new Error(`Unsupported Skill destination: ${destination}. Use workspace or user.`);
  const descriptor = adapter.traits.skills.destinations[destination];
  if (!descriptor || descriptor.supported === false) throw new Error(`Skill destination ${destination} is unsupported for ${adapter.id}.`);
  return path.resolve(destination === 'workspace' ? workspaceRoot : (options.userHome || os.homedir()), descriptor.root);
}

function recommendedCommands(id: any): any  {
  return {
    doctor: `buildr doctor --agent ${id} --target <dir> --json`,
    syncWorkspaceEntry: `buildr sync ${id} --target <dir>`,
    renderScope: `buildr render ${id} --scope <workspace-relative-path> --target <dir>`,
    renderSkillsScope: `buildr skills render ${id} --destination workspace --target <workspace>`,
    renderRulesScope: `buildr rules render ${id} --scope <scope> --target <dir>`,
    runtimeCheckScope: `buildr runtime check ${id} --scope <workspace-relative-path> --target <dir>`,
    installProductSkill: `buildr skill install ${id} --target <dir>`,
  };
}

function renderedRulesDiagnostics(label: any, codeId: any): any  {
  return {
    missingStatus: 'missing',
    missingPath: 'AGENTS.md',
    missingCode: `runtime.${codeId}_rules_missing`,
    label,
    codes: {
      ok: `runtime.${codeId}_rules_ok`,
      missing: `runtime.${codeId}_rules_missing`,
      stale: `runtime.${codeId}_rules_stale`,
      conflict: `runtime.${codeId}_rules_conflict`,
      orphan: `runtime.${codeId}_rules_orphan`,
    },
  };
}

const DESCRIPTORS: any[] = [
  createRuntimeAdapterDescriptor({
    id: 'claude-code',
    displayName: 'Claude Code',
    traits: {
      rules: {
        kind: 'reference-bridge',
        implementation: 'reference-bridge',
        placement: 'per-source',
        targetPattern: '<source-dir>/CLAUDE.md',
        diagnostics: {
          missingStatus: 'conflict',
          missingPath: 'CLAUDE.md',
          missingCode: 'runtime.rules_bridge_missing',
          label: 'Claude Code rules bridge',
          codes: { ok: 'runtime.reference_bridge_ok', missing: 'runtime.rules_bridge_missing', stale: 'runtime.rules_bridge_stale', conflict: 'runtime.rules_bridge_conflict', orphan: 'runtime.rules_bridge_orphan' },
        },
      },
      skills: { kind: 'vendor-root', implementation: 'filesystem-skills', root: '.claude' },
      surfaces: [{ kind: 'cli' }],
      activation: { rules: 'session-start', skills: 'session-start' },
      checker: { kind: 'projection', implementation: 'projection', resultKey: 'claudeCode', skillsManifestAbsentCode: 'runtime.skills_manifest_absent', installationProbe: { kind: 'none' }, versionProbe: { kind: 'none' } },
    },
    recommendedCommands: {
      doctor: 'buildr doctor --agent claude-code --target <dir> --json',
      syncWorkspaceEntry: 'buildr sync claude-code --target <dir>',
      renderScope: 'buildr render claude-code --scope <workspace-relative-path> --target <dir>',
      renderSkillsScope: 'buildr skills render claude-code --destination workspace --target <workspace>',
      renderRulesScope: 'buildr rules render claude-code --scope <scope> --target <dir>',
      runtimeCheckScope: 'buildr runtime check claude-code --scope <workspace-relative-path> --target <dir>',
      installProductSkill: 'buildr skill install claude-code --target <dir>',
    },
  }),
  createRuntimeAdapterDescriptor({
    id: 'codex',
    displayName: 'Codex',
    traits: {
      rules: {
        kind: 'native-recursive',
        implementation: 'native-recursive',
        diagnostics: { missingStatus: 'missing', missingPath: 'AGENTS.md', missingCode: 'runtime.codex_rules_missing', label: 'Codex native AGENTS.md rule asset', okCode: 'runtime.codex_rules_ok' },
      },
      skills: {
        kind: 'agents-compatible',
        implementation: 'filesystem-skills',
        root: '.agents',
        publicationExtensions: [{ path: 'agents/openai.yaml', format: 'openai-skill-metadata' }],
      },
      surfaces: [{ kind: 'cli' }, { kind: 'desktop' }],
      activation: { rules: 'path-read', skills: 'session-start', reloadGuidance: 'Codex discovers workspace Skills at session start. Only when a task changes runtime discovery, loading, or activation behavior and specialty acceptance explicitly requires host activation proof, use a host-supported reload or session evidence and report any unsupported gap.' },
      checker: { kind: 'projection', implementation: 'projection', resultKey: 'codex', installationProbe: { kind: 'none' }, versionProbe: { kind: 'none' } },
    },
    recommendedCommands: {
      doctor: 'buildr doctor --agent codex --target <dir> --json',
      syncWorkspaceEntry: 'buildr sync codex --target <dir>',
      renderScope: 'buildr render codex --scope <workspace-relative-path> --target <dir>',
      renderSkillsScope: 'buildr skills render codex --destination workspace --target <workspace>',
      runtimeCheckScope: 'buildr runtime check codex --scope <workspace-relative-path> --target <dir>',
      installProductSkill: 'buildr skill install codex --target <dir>',
    },
  }),
  createRuntimeAdapterDescriptor({
    id: 'cursor',
    displayName: 'Cursor',
    traits: {
      rules: {
        kind: 'vendor-rule-files', implementation: 'vendor-rule-files', format: 'cursor-mdc',
        targetPattern: '<source-dir>/.cursor/rules/buildr.mdc',
        diagnostics: renderedRulesDiagnostics('Cursor scoped project rule', 'cursor'),
      },
      skills: { kind: 'agents-compatible', implementation: 'filesystem-skills', root: '.agents' },
      surfaces: [{ kind: 'ide' }, { kind: 'cli' }],
      activation: { rules: 'path-read', skills: 'session-start', reloadGuidance: 'Start a new Cursor chat after adding or changing workspace destination Skills; reopen the chat if project-rule discovery is stale.' },
      checker: {
        kind: 'projection', implementation: 'projection', resultKey: 'cursor',
        installationProbe: { kind: 'manual', guidance: 'Confirm Cursor IDE or Cursor Agent CLI is installed for the surface you are using.' },
        versionProbe: { kind: 'manual', guidance: 'Record the Cursor IDE About version or run agent --version when the CLI is installed.' },
      },
    },
    recommendedCommands: recommendedCommands('cursor'),
    evidence: { rules: 'official-documentation-with-version-drift-mitigation', skills: 'official-documentation' },
  }),
  createRuntimeAdapterDescriptor({
    id: 'qoder',
    displayName: 'Qoder',
    traits: {
      rules: {
        kind: 'vendor-rule-files', implementation: 'vendor-rule-files', format: 'qoder-markdown',
        targetPattern: '<workspace-root>/.qoder/rules/buildr/<source-id>.md', maxChars: 100000,
        diagnostics: renderedRulesDiagnostics('Qoder vendor rule file', 'qoder'),
      },
      skills: { kind: 'vendor-root', implementation: 'filesystem-skills', root: '.qoder' },
      surfaces: [{ kind: 'ide' }],
      activation: { rules: 'path-read', skills: 'explicit-reload', reloadGuidance: 'Run /skills reload when available, or start a new Qoder session.' },
      checker: {
        kind: 'projection', implementation: 'projection', resultKey: 'qoder',
        installationProbe: { kind: 'command', executable: 'qoder', args: ['--version'], timeoutMs: 3000 },
        versionProbe: { kind: 'command', executable: 'qoder', args: ['--version'], timeoutMs: 3000 },
      },
    },
    recommendedCommands: recommendedCommands('qoder'),
    evidence: { rules: 'official-documentation-and-local-intake', skills: 'official-documentation-and-local-intake' },
  }),
  createRuntimeAdapterDescriptor({
    id: 'trae',
    displayName: 'TRAE',
    traits: {
      rules: {
        kind: 'vendor-rule-files', implementation: 'vendor-rule-files', format: 'trae-markdown',
        targetPattern: '<source-dir>/.trae/rules/buildr.md',
        diagnostics: renderedRulesDiagnostics('TRAE vendor rule file', 'trae'),
      },
      skills: { kind: 'agents-compatible', implementation: 'filesystem-skills', root: '.agents' },
      surfaces: [{ kind: 'ide' }],
      activation: { rules: 'path-read', skills: 'session-start', reloadGuidance: 'Start a new TRAE conversation after adding or changing Rules or Skills.' },
      checker: {
        kind: 'projection', implementation: 'projection', resultKey: 'trae',
        installationProbe: { kind: 'command', executable: 'trae', args: ['--version'], timeoutMs: 3000 },
        versionProbe: { kind: 'manual', guidance: 'Record the TRAE product version from About; trae --version may report the embedded editor build instead.' },
      },
    },
    recommendedCommands: recommendedCommands('trae'),
    evidence: { rules: 'installed-product-and-local-intake', skills: 'installed-product-and-local-intake' },
  }),
  createRuntimeAdapterDescriptor({
    id: 'trae-work',
    displayName: 'TRAE Work',
    traits: {
      rules: {
        kind: 'reference-bridge', implementation: 'reference-bridge', placement: 'root-index', template: 'buildr-root-index',
        targetPattern: '<workspace-root>/CLAUDE.local.md',
        diagnostics: renderedRulesDiagnostics('TRAE Work root rules bridge', 'trae_work'),
      },
      skills: { kind: 'vendor-root', implementation: 'filesystem-skills', root: '.trae' },
      surfaces: [{ kind: 'desktop' }],
      activation: { rules: 'session-start', skills: 'immediate', reloadGuidance: 'Start a new TRAE Work conversation after adding or changing imported Rules.' },
      checker: {
        kind: 'projection', implementation: 'projection', resultKey: 'traeWork',
        installationProbe: selectPlatformEnvironmentProbe({
          command: { kind: 'command', executable: 'defaults', args: ['read', '/Applications/TRAE SOLO.app/Contents/Info', 'CFBundleIdentifier'], timeoutMs: 3000 },
          guidance: '请在 TRAE Work 的 About 或安装信息中确认已安装及应用版本。',
        }),
        versionProbe: selectPlatformEnvironmentProbe({
          command: { kind: 'command', executable: 'defaults', args: ['read', '/Applications/TRAE SOLO.app/Contents/Info', 'CFBundleShortVersionString'], timeoutMs: 3000 },
          guidance: '请在 TRAE Work 的 About 或安装信息中确认应用版本。',
        }),
      },
    },
    recommendedCommands: recommendedCommands('trae-work'),
    evidence: { rules: 'official-documentation-and-local-intake', skills: 'official-documentation-and-local-intake' },
  }),
  createRuntimeAdapterDescriptor({
    id: 'workbuddy',
    displayName: 'WorkBuddy',
    traits: {
      rules: {
        kind: 'reference-bridge', implementation: 'reference-bridge', placement: 'root-index', template: 'buildr-root-index',
        targetPattern: '<workspace-root>/CODEBUDDY.md', maxChars: 8000,
        diagnostics: renderedRulesDiagnostics('WorkBuddy CODEBUDDY.md rules bridge', 'workbuddy'),
      },
      skills: { kind: 'vendor-root', implementation: 'filesystem-skills', root: '.codebuddy' },
      surfaces: [{ kind: 'desktop' }, { kind: 'cli', variant: 'desktop-bundled' }],
      activation: { rules: 'session-start', skills: 'session-start', reloadGuidance: 'Start a new WorkBuddy task after adding or changing Rules or Skills.' },
      checker: {
        kind: 'projection', implementation: 'projection', resultKey: 'workbuddy',
        installationProbe: selectPlatformEnvironmentProbe({
          command: { kind: 'command', executable: 'defaults', args: ['read', '/Applications/WorkBuddy.app/Contents/Info', 'CFBundleIdentifier'], timeoutMs: 3000 },
          guidance: '请在 WorkBuddy 的 About 或安装信息中确认已安装及应用版本。',
        }),
        versionProbe: selectPlatformEnvironmentProbe({
          command: { kind: 'command', executable: 'defaults', args: ['read', '/Applications/WorkBuddy.app/Contents/Info', 'CFBundleShortVersionString'], timeoutMs: 3000 },
          guidance: '请在 WorkBuddy 的 About 或安装信息中确认应用版本。',
        }),
      },
    },
    recommendedCommands: recommendedCommands('workbuddy'),
    evidence: { rules: 'installed-source-code', skills: 'installed-product-docs-and-source' },
  }),
];

export function validateAdapterDescriptor(descriptor: any, options: any = {}): any  {
  const errors: any[] = [];
  if (!descriptor || typeof descriptor !== 'object') return ['adapter descriptor must be an object'];
  errors.push(...validateAdapterTraits(descriptor, options));
  if (!AGENT_ID_PATTERN.test(descriptor.id || '')) errors.push(`adapter id is invalid: ${descriptor.id || '<missing>'}`);
  if (!descriptor.displayName) errors.push(`adapter ${descriptor.id || '<missing>'} displayName is required`);
  if (!Array.isArray(descriptor.runtimeTargets) || descriptor.runtimeTargets.length === 0) errors.push(`adapter ${descriptor.id} runtimeTargets are required`);
  if (new Set(descriptor.runtimeTargets || []).size !== (descriptor.runtimeTargets || []).length) errors.push(`adapter ${descriptor.id} runtimeTargets must be unique`);
  for (const capability of REQUIRED_RENDER_CAPABILITIES) {
    if (descriptor.renderCapabilities?.[capability]?.supported !== true) errors.push(`adapter ${descriptor.id} is missing required capability ${capability}`);
  }
  for (const capability of Object.keys(descriptor.renderCapabilities || {})) {
    if (!REQUIRED_RENDER_CAPABILITIES.includes(capability)) errors.push(`adapter ${descriptor.id} declares unknown capability ${capability}`);
  }
  if (typeof descriptor.planRuntime !== 'function') errors.push(`adapter ${descriptor.id} planRuntime is required`);
  if (!descriptor.implementation || !['string', 'object'].includes(typeof descriptor.implementation)) errors.push(`adapter ${descriptor.id} implementation entry is required`);
  if (!descriptor.recommendedCommands || typeof descriptor.recommendedCommands !== 'object') errors.push(`adapter ${descriptor.id} recommendedCommands are required`);
  const evidence = descriptor.evidence || {};
  for (const key of ['verificationLevel', 'smokeStatus', 'smoke']) {
    if (Object.hasOwn(evidence, key)) errors.push(`adapter ${descriptor.id} evidence must not encode runtime smoke state: ${key}`);
  }
  return errors;
}

export function createRuntimeAdapterRegistry(descriptors: any, options: any = {}): any  {
  const registry: Record<string, any> = {};
  const errors: any[] = [];
  for (const descriptor of descriptors) {
    errors.push(...validateAdapterDescriptor(descriptor, options));
    if (registry[descriptor?.id]) errors.push(`duplicate adapter id: ${descriptor.id}`);
    if (descriptor?.id) registry[descriptor.id] = descriptor;
  }
  if (errors.length > 0) throw new Error(`Invalid runtime adapter registry:\n- ${errors.join('\n- ')}`);
  const result = freeze({ ...registry });
  if (options.testOnly === true) return result;
  return result;
}

export const RUNTIME_ADAPTERS = createRuntimeAdapterRegistry(DESCRIPTORS);
export const SUPPORTED_AGENT_IDS = Object.freeze(Object.keys(RUNTIME_ADAPTERS));

function adapterImplementationFamily(adapter: any): any  {
  const rules = adapter.traits.rules;
  if (rules.kind === 'native-recursive') return 'native-recursive';
  if (rules.kind === 'reference-bridge') return rules.placement === 'root-index' ? 'root-index-bridge' : 'per-source-reference';
  if (rules.kind === 'vendor-rule-files') {
    return rules.targetPattern.includes(`/${adapter.traits.skills.root}/`) ? 'same-directory-vendor' : 'central-vendor';
  }
  throw new Error(`Runtime adapter ${adapter.id} has no registered implementation family.`);
}

export function runtimeAdapterImplementationMatrix(adapters: any = RUNTIME_ADAPTERS): any  {
  const representatives: any = new Map();
  const entries = Object.values(adapters).map((adapter: any) => {
    const family = adapterImplementationFamily(adapter);
    if (!representatives.has(family)) representatives.set(family, adapter.id);
    return Object.freeze({ adapterId: adapter.id, family });
  });
  const required: any[] = ['native-recursive', 'per-source-reference', 'same-directory-vendor', 'central-vendor', 'root-index-bridge'];
  const preferred: any = { 'native-recursive': 'codex', 'per-source-reference': 'claude-code', 'same-directory-vendor': 'qoder', 'central-vendor': 'cursor', 'root-index-bridge': 'workbuddy' };
  for (const [family, adapterId] of Object.entries(preferred) as Array<[string, string]>) {
    if (adapters[adapterId] && adapterImplementationFamily(adapters[adapterId]) === family) representatives.set(family, adapterId);
  }
  for (const family of required) if (!representatives.has(family)) throw new Error(`Runtime implementation family has no parity representative: ${family}`);
  return Object.freeze({
    entries: Object.freeze(entries),
    representatives: Object.freeze(required.map((family: any) => Object.freeze({ family, adapterId: representatives.get(family) }))),
  });
}

export function isSupportedAgent(agent: any): any  {
  return Object.hasOwn(RUNTIME_ADAPTERS, agent);
}

export function getRuntimeAdapter(agent: any): any  {
  const adapter = RUNTIME_ADAPTERS[agent];
  if (!adapter) throw new Error(`Unsupported Agent runtime: ${agent}`);
  return adapter;
}

export function selectAdapterImplementation(adapter: any, kind: any, implementations: any): any  {
  const implementation = adapter.implementation?.[kind];
  const selected = implementations[implementation];
  if (!selected) throw new Error(`Runtime adapter ${adapter.id} has no registered ${kind} implementation: ${implementation || '<missing>'}`);
  return selected;
}

export function runtimeDiscoveryPayload(): any  {
  return {
    supportedAgents: [...SUPPORTED_AGENT_IDS],
    requiredRenderCapabilities: [...REQUIRED_RENDER_CAPABILITIES],
    adapterTraitCatalog: ADAPTER_TRAIT_CATALOG,
    agents: Object.fromEntries(Object.entries(RUNTIME_ADAPTERS).map(([id, adapter]: any) => [id, {
      ...adapter,
      taskAdoption: {
        sessionEvidenceRequired: true,
        modes: adapter.traits.activation.skills === 'explicit-reload' ? ['new-session', 'reentered', 'reload'] : ['new-session', 'reentered'],
        guidance: adapter.traits.activation.reloadGuidance || `Start a new ${adapter.displayName} session with the current work root as its local project.`,
        sessionConsumption: 'unknown-until-adopted',
      },
    }])),
    unsupportedAgentGuidance: UNSUPPORTED_AGENT_GUIDANCE,
  };
}

export function createRuntimeContext(value: any): any  {
  const context: any = {
    adapterId: value.adapterId,
    targetRoot: path.resolve(value.targetRoot),
    scope: value.scope,
    rules: value.rules || { writes: [], nativeAssets: [], removals: [], actions: [] },
    skills: value.skills || { writes: [], removals: [] },
    findings: value.findings || [],
    repairs: value.repairs || [],
    warnings: value.warnings || [],
  };
  return freeze(context);
}

export function createRuntimePlan(value: any): any  {
  return freeze({
    schemaVersion: 'buildr.runtime-plan/v1',
    adapterId: value.adapterId,
    targetRoot: path.resolve(value.targetRoot),
    scope: value.scope,
    writes: value.writes || [],
    nativeAssets: value.nativeAssets || [],
    removals: value.removals || [],
    capabilityEvidence: value.capabilityEvidence || [],
    findings: value.findings || [],
    repairs: value.repairs || [],
    warnings: value.warnings || [],
    ruleActions: value.ruleActions || [],
  });
}

function safeTarget(targetRoot: any, targetFile: any): any  {
  const root = path.resolve(targetRoot);
  const target = path.resolve(targetFile);
  return target !== root && target.startsWith(`${root}${path.sep}`);
}

function firstSymbolicLinkSegment(targetRoot: any, targetFile: any): any  {
  const root = path.resolve(targetRoot);
  const target = path.resolve(targetFile);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  let current = root;
  for (const segment of ['.', ...relative.split(path.sep)]) {
    if (segment !== '.') current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return current;
    } catch (error: any) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  return null;
}

export function assertRuntimeTargetPath(targetRoot: any, targetFile: any, label: any = 'Runtime target'): any  {
  if (!safeTarget(targetRoot, targetFile)) {
    throw new Error(`${label} is outside target root: ${targetFile}`);
  }
  const symbolicLink = firstSymbolicLinkSegment(targetRoot, targetFile);
  if (symbolicLink) {
    throw new Error(`${label} crosses a symbolic link: ${symbolicLink}`);
  }
  return path.resolve(targetFile);
}

export function validateRuntimePlan(plan: any, adapter: any = getRuntimeAdapter(plan?.adapterId)): any  {
  const errors: any[] = [];
  if (plan?.schemaVersion !== 'buildr.runtime-plan/v1') errors.push('runtime plan schemaVersion is invalid');
  if (plan?.adapterId !== adapter.id) errors.push(`runtime plan adapterId does not match descriptor: ${plan?.adapterId}`);
  const writes: any = new Map();
  for (const item of plan?.writes || []) {
    try { assertRuntimeTargetPath(plan.targetRoot, item.targetFile, 'runtime write target'); }
    catch (error: any) { errors.push(error.message); }
    if (typeof item.content !== 'string') errors.push(`runtime write content must be a string: ${item.targetFile}`);
    try {
      runtimeWriteBuffer(item);
      runtimeWriteMode(item);
      if (item.sourceContent !== undefined) runtimeWriteBuffer(item, true);
    } catch (error: any) {
      errors.push(error.message);
    }
    if (item.commitLast !== undefined && typeof item.commitLast !== 'boolean') errors.push(`runtime write commitLast must be boolean: ${item.targetFile}`);
    if (item.previousIntegrity !== undefined && !/^sha256-[a-f0-9]{64}$/.test(item.previousIntegrity)) errors.push(`runtime write previous integrity is invalid: ${item.targetFile}`);
    if (item.previousExecutable !== undefined && typeof item.previousExecutable !== 'boolean') errors.push(`runtime write previous executable is invalid: ${item.targetFile}`);
    const existing = writes.get(path.resolve(item.targetFile));
    const identity = JSON.stringify([item.contentEncoding || 'utf8', item.content, item.mode ?? null]);
    const existingIdentity = existing && JSON.stringify([existing.contentEncoding || 'utf8', existing.content, existing.mode ?? null]);
    if (existing && existingIdentity !== identity) errors.push(`runtime writes contain conflicting target: ${item.targetFile}`);
    else writes.set(path.resolve(item.targetFile), item);
  }
  const removals: any = new Set();
  for (const item of plan?.removals || []) {
    const targetFile = typeof item === 'string' ? item : item.targetFile;
    try { assertRuntimeTargetPath(plan.targetRoot, targetFile, 'runtime removal target'); }
    catch (error: any) { errors.push(error.message); }
    if (typeof item !== 'string' && item.expectedIntegrity !== undefined && !/^sha256-[a-f0-9]{64}$/.test(item.expectedIntegrity)) errors.push(`runtime removal integrity is invalid: ${targetFile}`);
    if (typeof item !== 'string' && item.expectedExecutable !== undefined && typeof item.expectedExecutable !== 'boolean') errors.push(`runtime removal executable is invalid: ${targetFile}`);
    if (typeof item !== 'string' && item.removeLast !== undefined && typeof item.removeLast !== 'boolean') errors.push(`runtime removal removeLast must be boolean: ${targetFile}`);
    if (writes.has(path.resolve(targetFile))) errors.push(`runtime target cannot be written and removed: ${targetFile}`);
    if (removals.has(path.resolve(targetFile))) errors.push(`runtime removals contain duplicate target: ${targetFile}`);
    removals.add(path.resolve(targetFile));
  }
  const evidence: any = new Map((plan?.capabilityEvidence || []).map((item: any) => [item.capability, item]));
  for (const capability of REQUIRED_RENDER_CAPABILITIES) {
    if (evidence.get(capability)?.supported !== true) errors.push(`runtime plan is missing capability evidence: ${capability}`);
  }
  for (const capability of evidence.keys()) {
    if (!REQUIRED_RENDER_CAPABILITIES.includes(capability)) errors.push(`runtime plan has unknown capability evidence: ${capability}`);
  }
  if (errors.length > 0) throw new Error(`Invalid runtime plan for ${adapter.id}:\n- ${errors.join('\n- ')}`);
  return plan;
}

function runtimePath(targetRoot: any, targetFile: any): any  {
  return path.relative(targetRoot, targetFile).split(path.sep).join('/');
}

function runtimeWriteMismatchSummary(item: any, current: any, expected: any): any  {
  if (item.kind !== 'skill-projection-receipt' || current === null) return '';
  const hashes = `current=${sha256Integrity(current)} expected=${sha256Integrity(expected)}`;
  try {
    const currentReceipt = JSON.parse(current.toString('utf8'));
    const expectedReceipt = JSON.parse(expected.toString('utf8'));
    const fields = [...new Set([...Object.keys(currentReceipt), ...Object.keys(expectedReceipt)])]
      .filter((field: any) => JSON.stringify(currentReceipt[field]) !== JSON.stringify(expectedReceipt[field]))
      .sort();
    const currentFiles: any = new Map((currentReceipt.files || []).map((file: any) => [file.path, file]));
    const expectedFiles: any = new Map((expectedReceipt.files || []).map((file: any) => [file.path, file]));
    const fileDifferences = [...new Set([...currentFiles.keys(), ...expectedFiles.keys()])]
      .sort()
      .filter((file: any) => JSON.stringify(currentFiles.get(file)) !== JSON.stringify(expectedFiles.get(file)))
      .slice(0, 5)
      .map((file: any) => `${file}: current=${JSON.stringify(currentFiles.get(file) ?? null)} expected=${JSON.stringify(expectedFiles.get(file) ?? null)}`);
    const files = fileDifferences.length > 0 ? ` File differences: ${fileDifferences.join('; ')}.` : '';
    return ` Receipt differences: ${fields.join(', ') || 'serialized bytes only'}; ${hashes}.${files}`;
  } catch {
    return ` Receipt bytes differ; ${hashes}.`;
  }
}

function diagnosticFinding(item: any, observedStatus: any, plan: any, detail: any = ''): any  {
  const diagnostic = item.diagnostic || {};
  const status = observedStatus === 'ok' && diagnostic.currentStatus
    ? diagnostic.currentStatus
    : observedStatus === 'ok' && diagnostic.actionRequiredWhenCurrent ? 'stale' : observedStatus;
  const code = diagnostic.codes?.[status] || diagnostic.code;
  const message = (diagnostic.messages?.[status]
    || (status === 'ok' ? `${diagnostic.label || item.source || 'runtime target'} is up to date.` : `${diagnostic.label || item.source || 'runtime target'} is ${status}.`));
  const detailedMessage = `${message}${detail}`;
  const repair = status === 'ok' ? undefined : diagnostic.repairs?.[status] || diagnostic.repair;
  return {
    status,
    path: runtimePath(plan.targetRoot, item.targetFile),
    adapter: plan.adapterId,
    source: item.source,
    message: detailedMessage,
    ...(code ? { code } : {}),
    ...(repair ? { repair } : {}),
    userActionRequired: status !== 'ok' && status !== 'info' && status !== 'warning',
  };
}

export function reconcileRuntimePlan(plan: any, options: any = {}): any  {
  validateRuntimePlan(plan);
  const snapshotRuntimePlanTargets = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-rollback-'));
    const targets = [...new Set([
      ...plan.writes.map((item: any) => path.resolve(item.targetFile)),
      ...plan.removals.map((item: any) => path.resolve(typeof item === 'string' ? item : item.targetFile)),
    ])].sort((left: any, right: any) => left.localeCompare(right));
    const snapshots = targets.map((target: any, index: any) => {
      let existingAncestor = path.dirname(target);
      while (existingAncestor !== plan.targetRoot && !fs.existsSync(existingAncestor)) existingAncestor = path.dirname(existingAncestor);
      const existed = fs.existsSync(target);
      const backup = path.join(root, String(index));
      if (existed) fs.cpSync(target, backup, { recursive: true, preserveTimestamps: true });
      return { target, backup, existed, existingAncestor };
    });
    return {
      restore: () => {
        for (const snapshot of [...snapshots].reverse()) {
          fs.rmSync(snapshot.target, { recursive: true, force: true });
          if (snapshot.existed) {
            fs.mkdirSync(path.dirname(snapshot.target), { recursive: true });
            fs.cpSync(snapshot.backup, snapshot.target, { recursive: true, preserveTimestamps: true });
          } else {
            let current = path.dirname(snapshot.target);
            while (current !== snapshot.existingAncestor && current.startsWith(`${plan.targetRoot}${path.sep}`)) {
              if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) break;
              fs.rmdirSync(current);
              current = path.dirname(current);
            }
          }
        }
      },
      cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
  };
  const compareOnly = options.compareOnly === true;
  const conflicts: any[] = [];
  const changed: any[] = [];
  const removed: any[] = [];
  for (const item of plan.writes) {
    if (!fs.existsSync(item.targetFile)) continue;
    const current = fs.readFileSync(item.targetFile);
    const expected = runtimeWriteBuffer(item);
    const modeMatches = runtimeWriteModeMatches(item.targetFile, item);
    const currentText = (item.contentEncoding || 'utf8') === 'utf8' ? current.toString('utf8') : null;
    const matches = (current.equals(expected) && modeMatches) || (currentText !== null && item.matchesCurrent?.(currentText) === true);
    const source = runtimeWriteBuffer(item, true);
    const sourceMatches = source !== null && current.equals(source);
    const previousMatches = item.previousIntegrity
      ? runtimeFileMatches(item.targetFile, item.previousIntegrity, item.previousExecutable)
      : false;
    if (!matches && !sourceMatches && !previousMatches && item.isManaged) {
      const managedInput = currentText === null ? current : currentText;
      if (!item.isManaged(managedInput)) conflicts.push(item);
    }
  }
  for (const removal of plan.removals) {
    const item = typeof removal === 'string' ? { targetFile: removal } : removal;
    if (!fs.existsSync(item.targetFile) || !item.expectedIntegrity) continue;
    if (!runtimeFileMatches(item.targetFile, item.expectedIntegrity, item.expectedExecutable)) conflicts.push(item);
  }
  const findings: any[] = [...plan.findings];
  for (const item of conflicts) findings.push(diagnosticFinding(item, 'conflict', plan));
  const plannedConflicts = findings.filter((finding: any) => finding.status === 'conflict');
  if (!compareOnly && plannedConflicts.length > 0) {
    throw new Error(`Runtime reconcile found conflict(s); no files were changed:\n- ${plannedConflicts.map((finding: any) => finding.message || finding.path).sort().join('\n- ')}`);
  }
  const rollback = !compareOnly && plan.removals.some((item: any) => typeof item !== 'string' && item.kind === 'legacy-skill-projection-ownership-receipt')
    ? snapshotRuntimePlanTargets()
    : null;
  const reconcileWrite = (item: any) => {
    if (conflicts.includes(item)) return;
    const current = fs.existsSync(item.targetFile) ? fs.readFileSync(item.targetFile) : null;
    const expected = runtimeWriteBuffer(item);
    const expectedMode = runtimeWriteMode(item);
    const currentText = current !== null && (item.contentEncoding || 'utf8') === 'utf8' ? current.toString('utf8') : null;
    const modeMatches = current === null || runtimeWriteModeMatches(item.targetFile, item);
    const status = current === null
      ? 'missing'
      : (current.equals(expected) && modeMatches) || (currentText !== null && item.matchesCurrent?.(currentText) === true)
        ? 'ok'
        : 'stale';
    findings.push(diagnosticFinding(item, status, plan, status === 'stale' ? runtimeWriteMismatchSummary(item, current, expected) : ''));
    if (!compareOnly && status !== 'ok') {
      fs.mkdirSync(path.dirname(item.targetFile), { recursive: true });
      fs.writeFileSync(item.targetFile, expected);
      if (expectedMode !== null) {
        const currentMode = fs.statSync(item.targetFile).mode;
        fs.chmodSync(item.targetFile, expectedMode === 0o100 ? currentMode | 0o100 : currentMode & ~0o100);
      }
      changed.push(item.targetFile);
    }
  };
  try {
    for (const item of plan.writes.filter((write: any) => write.commitLast !== true)) reconcileWrite(item);
    for (const nativeAsset of plan.nativeAssets) {
      const item = typeof nativeAsset === 'string' ? { targetFile: nativeAsset, source: nativeAsset } : nativeAsset;
      const status = fs.existsSync(item.targetFile) ? 'ok' : 'missing';
      findings.push(diagnosticFinding(item, status, plan));
    }
    const reconcileRemoval = (removal: any) => {
      const item = typeof removal === 'string' ? { targetFile: removal } : removal;
      if (conflicts.includes(item)) return;
      if (!fs.existsSync(item.targetFile)) return;
      if (item.isManaged && !item.isManaged(item.type === 'directory' ? null : fs.readFileSync(item.targetFile, 'utf8'))) return;
      findings.push(diagnosticFinding(item, 'orphan', plan));
      if (!compareOnly) {
        fs.rmSync(item.targetFile, { recursive: item.type === 'directory', force: true });
        removed.push(item.targetFile);
        if (item.pruneEmptyRoot) {
          const root = path.resolve(item.pruneEmptyRoot);
          let current = path.dirname(path.resolve(item.targetFile));
          while ((current === root || current.startsWith(`${root}${path.sep}`)) && current !== path.dirname(root)) {
            if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) break;
            fs.rmdirSync(current);
            if (current === root) break;
            current = path.dirname(current);
          }
        }
      }
    };
    for (const removal of plan.removals.filter((item: any) => typeof item === 'string' || item.removeLast !== true)) reconcileRemoval(removal);
    for (const item of plan.writes.filter((write: any) => write.commitLast === true)) reconcileWrite(item);
    for (const removal of plan.removals.filter((item: any) => typeof item !== 'string' && item.removeLast === true)) reconcileRemoval(removal);
    return { targetRoot: plan.targetRoot, adapterId: plan.adapterId, scope: plan.scope, changed, removed, findings, repairs: plan.repairs, warnings: plan.warnings, ruleActions: plan.ruleActions };
  } catch (error: any) {
    rollback?.restore();
    throw error;
  } finally {
    rollback?.cleanup();
  }
}
