/** Pure, detached composition derivation; never writes the source declaration. */
export const COMPOSITION_SCHEMA = 'buildr.dsh-composition/v1';
export const COMPOSITION_OWNER_ID = 'buildr-composition';
export const ROOT_MODULES = {
  tools: '@deepseek-ai/dsh-tools',
  'agent-loop': '@deepseek-ai/dsh-agent-loop',
  skill: '@deepseek-ai/dsh-skill',
} as const;
export const PRESET_IDS = ['preset-standard', 'preset-ptc', 'preset-cordis'] as const;
export const PRESET_MODULE = '@deepseek-ai/dsh-agent-preset';
export const CLIENT_MODULES = { 'ui-trajectory': '@deepseek-ai/dsh-client-ui-trajectory',
  'ui-settings-agent-loop': '@deepseek-ai/dsh-client-ui-settings-agent-loop' } as const;
export const PRESET_MODULES = [
  '@deepseek-ai/dsh-agent-instructions', '@deepseek-ai/dsh-skill-filesystem',
  '@deepseek-ai/dsh-tool-skill', '@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-bash',
] as const;
export interface RawEntry { id: string; name: string; config?: unknown; [key: string]: unknown }
export interface CompositionDefinition {
  schemaVersion: typeof COMPOSITION_SCHEMA;
  modules: Record<string, string>;
  presetOwner: string;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
export function assertDefinition(value: unknown): asserts value is CompositionDefinition {
  if (!record(value) || value.schemaVersion !== COMPOSITION_SCHEMA || !record(value.modules)
    || typeof value.presetOwner !== 'string') throw Error('buildr-composition: invalid package definition');
  for (const name of [...Object.values(ROOT_MODULES), ...PRESET_MODULES]) {
    const file = value.modules[name];
    if (typeof file !== 'string' || !/^file:\/\//.test(file)) throw Error('buildr-composition: missing producer module');
  }
  if (!value.presetOwner.startsWith('file://')) throw Error('buildr-composition: missing preset owner');
}
export function derivePreset(config: unknown, modules: Readonly<Record<string, string>>): Record<string, unknown> {
  if (!record(config) || typeof config.id !== 'string' || !Array.isArray(config.plugins)) {
    throw Error('buildr-composition: invalid preset declaration');
  }
  const copy = structuredClone(config);
  const counts = new Map<string, number>();
  function visit(rows: unknown): void {
    if (!Array.isArray(rows)) throw Error('buildr-composition: invalid preset group');
    for (const row of rows) {
      if (!record(row) || typeof row.name !== 'string') throw Error('buildr-composition: invalid preset row');
      if (row.group === true) { visit(row.config); continue; }
      if ((PRESET_MODULES as readonly string[]).includes(row.name)) {
        counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
        const target = modules[row.name];
        if (target === undefined) throw Error('buildr-composition: missing preset producer');
        row.name = target;
      }
    }
  }
  visit(copy.plugins);
  if (PRESET_MODULES.some(name => counts.get(name) !== 1)) throw Error('buildr-composition: ambiguous or missing preset producer');
  return copy;
}
/** Known top-level owners only: copying a nested owner would flatten its isolation context. */
export function deriveEntries(entries: readonly RawEntry[], definition: CompositionDefinition): RawEntry[] {
  assertDefinition(definition);
  const result: RawEntry[] = [];
  for (const [id, name] of Object.entries(ROOT_MODULES)) {
    const found = entries.filter(row => row.id === id);
    if (found.length !== 1 || found[0]!.name !== name) throw Error(`buildr-composition: unknown root owner ${id}`);
    result.push({ ...structuredClone(found[0]!), name: definition.modules[name]! });
  }
  for (const id of PRESET_IDS) {
    const found = entries.filter(row => row.id === id);
    if (found.length === 0) continue;
    if (found.length !== 1 || found[0]!.name !== PRESET_MODULE) throw Error(`buildr-composition: unknown preset owner ${id}`);
    const original = found[0]!;
    result.push({ ...structuredClone(original), name: definition.presetOwner, config: derivePreset(original.config, definition.modules) });
  }
  for (const [id, name] of Object.entries(CLIENT_MODULES)) {
    const found = entries.filter(row => row.id === id);
    if (found.length === 0 || definition.modules[name] === undefined) continue;
    if (found.length !== 1 || found[0]!.name !== name) throw Error(`buildr-composition: unknown client owner ${id}`);
    result.push({ ...structuredClone(found[0]!), name: definition.modules[name]! });
  }
  return result;
}
