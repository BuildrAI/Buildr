import { readSkillText } from '../persistence/skill-content-repository.ts';
import fs from 'node:fs';
import path from 'node:path';
import { createSourceObjectRepository, observedVersion, sourceRelativePath, type SourceAssetRead } from '../persistence/source-object-repository.ts';
import { boundSourceResult, parseObservation, parseSourceInput, sourceError, SOURCE_LIMITS, SOURCE_RESULT_SCHEMA, type SourceResult, type SourceItem } from './source-observations.ts';

export interface SourceQueryDependencies {
  assets: SourceAssetRead;
  workspace: {
    resolveSourceWorkspaceRoot(targetDirectory: string): string | null;
    getWorkspace(root: string, options?: { requireRootProof?: boolean }): { workspace: { id: string | null }; rootPath: string };
    readProjectRegistryRecord(root: string, options?: { requireRootProof?: boolean }): { projects: Record<string, unknown> };
  };
  task: { readTaskBrief(root: string, id: string): { root: string; taskId: string; brief: string | null } };
  materials: { inspectTaskMaterial(root: string, id: string, materialId: string): { id: string; content: string | null; actualDigest: string | null; exists: boolean; source: unknown } | null };
}
/** Read only existing source authorities. Each observation has a local failure. */
export function createSourceQuery(dependencies: SourceQueryDependencies) {
  const repository = createSourceObjectRepository(dependencies.assets);
  return {
    inspect(targetRoot: string, value: unknown, options: { signal?: AbortSignal; timeoutMs?: number } = {}): SourceResult {
      const input = parseSourceInput(value);
      const locatedRoot = dependencies.workspace.resolveSourceWorkspaceRoot(path.resolve(targetRoot));
      if (!locatedRoot) throw sourceError('source_workspace_unknown', '当前目录及其祖先没有可证明的工作空间入口。');
      const root = fs.realpathSync(locatedRoot);
      sourceRelativePath(root, '.buildr/workspace.yml');
      readSkillText(root, '.buildr/workspace.yml', { requireRootProof: true });
      if (fs.existsSync(path.join(root, 'skills/manifest.yml'))) { sourceRelativePath(root, 'skills/manifest.yml'); readSkillText(root, 'skills/manifest.yml', { requireRootProof: true }); }
      const workspace = dependencies.workspace.getWorkspace(root, { requireRootProof: true });
      if (fs.realpathSync(workspace.rootPath) !== root) throw sourceError('source_workspace_conflict', '观察到的工作空间根与来源读取根不一致。');
      const workspaceId = workspace.workspace.id;
      if (!workspaceId) throw sourceError('source_workspace_unknown', '当前目录缺少可证明的工作空间身份。');
      const scope = input.scope;
      if (scope !== '.' && !/^projects\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._/-]+)?$/.test(scope)) throw sourceError('source_scope_forbidden', 'scope 必须是当前工作空间中的已登记项目范围。');
      if (scope !== '.') {
        const project = scope.split('/')[1];
        const registry = dependencies.workspace.readProjectRegistryRecord(root, { requireRootProof: true });
        if (!registry.projects[project]) throw sourceError('source_scope_unknown', '当前工作空间没有登记这个项目范围。');
        const relative = path.relative(root, path.resolve(root, scope));
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw sourceError('source_scope_forbidden', 'scope 不得越过工作空间。');
      }
      const deadline = Date.now() + Math.min(options.timeoutMs ?? SOURCE_LIMITS.timeoutMs, SOURCE_LIMITS.timeoutMs);
      const seen = new Set<string>();
      let publishedBytes = 0;
      const items = input.observations.map((raw, index): SourceItem => {
        let id = `observation-${index}`;
        try {
          if (options.signal?.aborted) throw sourceError('source_cancelled', '来源查询已取消。');
          if (Date.now() >= deadline) throw sourceError('source_timeout', '来源查询超时。');
          const observation = parseObservation(raw); id = observation.id;
          if (seen.has(id)) throw sourceError('source_input_invalid', '同批观察编码重复。');
          seen.add(id); observedVersion(observation);
          let result: { objects: SourceItem['objects']; mixed?: boolean };
          if (observation.type === 'task-brief' || observation.type === 'task-material') {
            return { id, status: 'unknown', objects: [], diagnostic: { code: 'source_user_material_excluded', message: '用户任务说明与资料不纳入 Buildr 参与观察；能力调用仅关联必要目标引用，不重读正文。' } };
          } else if (observation.type === 'capability') {
            const object = repository.capability(root, workspaceId, scope, observation);
            result = { objects: object ? [object] : [] };
          } else result = repository.read(root, workspaceId, scope, observation);
          // Capture needs identity and proof, never a second copy of asset or user method bodies.
          if (input.mode === 'metadata') result = { ...result, objects: result.objects.map(object => ({
            ...object, current: null, observed: object.observed.digest === undefined ? {} : { digest: object.observed.digest },
          })) };
          const bytes = Buffer.byteLength(JSON.stringify(result));
          if (publishedBytes + bytes > SOURCE_LIMITS.outputBytes) throw sourceError('source_output_limit', '本批对象正文超过 2 MiB；请按对象分批读取。');
          publishedBytes += bytes;
          return { id, status: result.objects.length ? 'detected' : 'unknown', ...result, diagnostic: result.objects.length ? null : { code: 'source_not_proven', message: '当前登记与观察证据不足以确认此对象来源。' } };
        } catch (cause) {
          const code = cause instanceof Error && 'code' in cause ? String(cause.code) : 'source_read_unavailable';
          return { id, status: code.includes('conflict') ? 'conflict' : 'error', objects: [], diagnostic: { code, message: code.startsWith('source_') && cause instanceof Error ? cause.message : '对象当前不可读取；未改变任何工作资产。' } };
        }
      });
      return boundSourceResult({ schemaVersion: SOURCE_RESULT_SCHEMA, workspace: { id: workspaceId, scope }, items, effects: [] });
    },
  };
}
