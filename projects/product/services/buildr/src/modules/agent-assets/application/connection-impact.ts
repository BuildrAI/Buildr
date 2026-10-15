export interface SkillConnectionImpacts {
  instances: Array<{ id: string; name: string; sourcePath: string; definitionId: string; sourceIdentity: string }>;
  diagnostics: string[];
}
export type SkillConnectionImpactReader = (root: string, assetIdentity: string) => SkillConnectionImpacts;
export function createSkillConnectionImpactPort() {
  let reader: SkillConnectionImpactReader | null = null;
  return Object.freeze({
    bindConnectionImpacts(value: SkillConnectionImpactReader) {
      if (reader || typeof value !== 'function') throw new Error('Connection impact reader can be bound exactly once.');
      reader = value;
    },
    read(root: string, assetIdentity: string): SkillConnectionImpacts {
      if (!reader) return { instances: [], diagnostics: [] };
      try { return reader(root, assetIdentity); }
      catch { return { instances: [], diagnostics: ['连接实例影响当前无法完整读取；源资产操作仍可继续，实例和认证将保留。'] }; }
    },
  });
}
export function connectionImpactObjects(value: SkillConnectionImpacts): Array<Record<string, unknown>> {
  return [...value.instances.map(instance => ({ kind: 'connection', ...instance })), ...value.diagnostics.map(message => ({ kind: 'connection-diagnostic', message }))];
}
