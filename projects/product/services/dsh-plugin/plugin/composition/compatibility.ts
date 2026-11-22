/** Read-only host contract verification before replacing any official DSH modules. */
import { CLIENT_MODULES, PRESET_IDS, PRESET_MODULE, ROOT_MODULES, type CompositionDefinition, type RawEntry } from './definition.ts';

export const REQUIRED_SIBLING_ENTRY_IDS = [
  'agent-loop',
  'tool-executor-native',
  'tool-executor-ptc',
  'webserver',
  'web-runtime',
  'modules',
  'connection',
  'headless-runner',
  'acp',
  'sdk-jsonrpc-server',
] as const;

export type ModuleContractResult =
  | { compatible: true }
  | { compatible: false; reason: string };

export type CompatibilityProbeResult =
  | { compatible: true; checkedModules: string[] }
  | { compatible: false; incompatibleModules: string[]; detail: string };

export interface ServiceContract {
  kind: 'class' | 'plugin-object' | 'invalid';
  methods: string[];
}

export function unwrapPluginExport(moduleNamespace: unknown): unknown {
  if (moduleNamespace !== null && typeof moduleNamespace === 'object' && 'default' in moduleNamespace) {
    const exported = (moduleNamespace as { default?: unknown }).default;
    if (exported !== undefined) return exported;
  }
  return moduleNamespace;
}

export function collectPrototypeMethods(ctor: Function): string[] {
  const methods = new Set<string>();
  let current: unknown = ctor.prototype;
  while (current !== null && current !== undefined && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === 'constructor' || key.startsWith('_')) continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor && typeof descriptor.value === 'function') methods.add(key);
    }
    current = Object.getPrototypeOf(current);
  }
  return [...methods].sort();
}

export function collectLiveMethods(instance: unknown): string[] {
  if (instance === null || (typeof instance !== 'object' && typeof instance !== 'function')) return [];
  const methods = new Set<string>();
  let current: unknown = instance;
  while (current !== null && current !== undefined && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === 'constructor' || key.startsWith('_')) continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor && typeof descriptor.value === 'function') methods.add(key);
    }
    current = Object.getPrototypeOf(current);
  }
  return [...methods].sort();
}

export function collectServiceContract(moduleNamespace: unknown): ServiceContract {
  const target = unwrapPluginExport(moduleNamespace);
  if (typeof target === 'function') {
    return { kind: 'class', methods: collectPrototypeMethods(target) };
  }
  if (target !== null && typeof target === 'object' && typeof (target as { apply?: unknown }).apply === 'function') {
    return { kind: 'plugin-object', methods: [] };
  }
  return { kind: 'invalid', methods: [] };
}

export function compareModuleContract(
  moduleName: string,
  stockModule: unknown,
  enhancedModule: unknown,
  liveStockInstance?: unknown,
): ModuleContractResult {
  const stock = collectServiceContract(stockModule);
  const enhanced = collectServiceContract(enhancedModule);
  if (enhanced.kind === 'invalid') {
    return { compatible: false, reason: `${moduleName}: enhanced module export is invalid` };
  }
  if (stock.kind === 'invalid') {
    return { compatible: false, reason: `${moduleName}: host module export structure is unsupported` };
  }
  if (stock.kind === 'class') {
    if (enhanced.kind !== 'class') {
      return { compatible: false, reason: `${moduleName}: host expects a class service, enhanced exports ${enhanced.kind}` };
    }
    const enhancedSet = new Set(enhanced.methods);
    const missing = stock.methods.filter(method => !enhancedSet.has(method));
    if (missing.length > 0) {
      return { compatible: false, reason: `${moduleName}: missing host methods (${missing.join(', ')})` };
    }
    if (liveStockInstance !== undefined) {
      const liveMissing = collectLiveMethods(liveStockInstance).filter(method => !enhancedSet.has(method));
      if (liveMissing.length > 0) {
        return { compatible: false, reason: `${moduleName}: missing live host methods (${liveMissing.join(', ')})` };
      }
    }
  }
  return { compatible: true };
}

function collectPresetModulesFromConfig(config: unknown, output: Set<string>, allowedModules: Readonly<Record<string, string>>): void {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return;
  const plugins = (config as { plugins?: unknown }).plugins;
  if (!Array.isArray(plugins)) return;
  const visit = (rows: unknown): void => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
      const item = row as { name?: unknown; group?: unknown; config?: unknown; disabled?: unknown };
      if (item.disabled === true) continue;
      if (item.group === true) {
        visit(item.config);
        continue;
      }
      if (typeof item.name === 'string' && Object.hasOwn(allowedModules, item.name)) {
        output.add(item.name);
      }
    }
  };
  visit(plugins);
}

export function collectActiveTargetModules(rows: readonly RawEntry[], definition: CompositionDefinition): string[] {
  const ordered = new Set<string>();
  const rootValues = new Set<string>(Object.values(ROOT_MODULES));
  const clientValues = new Set<string>(Object.values(CLIENT_MODULES));
  const presetIdSet = new Set<string>(PRESET_IDS);

  for (const row of rows) {
    if (row.disabled === true) continue;
    if (rootValues.has(row.name) && Object.hasOwn(ROOT_MODULES, row.id)) {
      ordered.add(row.name);
      continue;
    }
    if (clientValues.has(row.name) && Object.hasOwn(CLIENT_MODULES, row.id) && definition.modules[row.name] !== undefined) {
      ordered.add(row.name);
      continue;
    }
    if (presetIdSet.has(row.id) && row.name === PRESET_MODULE) {
      collectPresetModulesFromConfig(row.config, ordered, definition.modules);
    }
  }
  return [...ordered];
}

function hasActivePreset(rows: readonly RawEntry[]): boolean {
  const presetIdSet = new Set<string>(PRESET_IDS);
  return rows.some(row => row.disabled !== true && presetIdSet.has(row.id) && row.name === PRESET_MODULE);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function probeCompositionCompatibility(input: {
  rows: readonly RawEntry[];
  definition: CompositionDefinition;
  baseUrl: string;
  importModule: (specifier: string, baseUrl: string) => Promise<unknown>;
  liveServices?: Readonly<Record<string, unknown>>;
}): Promise<CompatibilityProbeResult> {
  const targets = collectActiveTargetModules(input.rows, input.definition);
  const incompatibleModules: string[] = [];
  const reasons: string[] = [];

  for (const moduleName of targets) {
    const enhancedSpecifier = input.definition.modules[moduleName];
    if (!enhancedSpecifier) {
      incompatibleModules.push(moduleName);
      reasons.push(`${moduleName}: missing enhanced module definition`);
      continue;
    }
    let stockModule: unknown;
    try {
      stockModule = await input.importModule(moduleName, input.baseUrl);
    } catch (error) {
      incompatibleModules.push(moduleName);
      reasons.push(`${moduleName}: failed to load host module (${formatError(error)})`);
      continue;
    }
    let enhancedModule: unknown;
    try {
      enhancedModule = await input.importModule(enhancedSpecifier, input.baseUrl);
    } catch (error) {
      incompatibleModules.push(moduleName);
      reasons.push(`${moduleName}: failed to load enhanced module (${formatError(error)})`);
      continue;
    }
    const comparison = compareModuleContract(moduleName, stockModule, enhancedModule, input.liveServices?.[moduleName]);
    if (!comparison.compatible) {
      incompatibleModules.push(moduleName);
      reasons.push(comparison.reason);
    }
  }

  if (hasActivePreset(input.rows)) {
    try {
      const presetOwner = await input.importModule(input.definition.presetOwner, input.baseUrl);
      if (collectServiceContract(presetOwner).kind === 'invalid') {
        incompatibleModules.push(PRESET_MODULE);
        reasons.push(`${PRESET_MODULE}: preset owner export is invalid`);
      }
    } catch (error) {
      incompatibleModules.push(PRESET_MODULE);
      reasons.push(`${PRESET_MODULE}: failed to load preset owner (${formatError(error)})`);
    }
  }

  if (incompatibleModules.length > 0) {
    return { compatible: false, incompatibleModules, detail: reasons.join('; ') };
  }
  return { compatible: true, checkedModules: targets };
}
