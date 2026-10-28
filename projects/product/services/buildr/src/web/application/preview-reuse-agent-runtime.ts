import fs from 'node:fs';
import path from 'node:path';
import { withAgentDataOffline } from '@buildr-ai/buildr-agent';

import type { PreviewReuseFacet, PreviewReuseFacetOutcome } from './preview-reuse.ts';
import { MODEL_CATALOG_FACET } from './preview-reuse-model-catalog.ts';
import { assertWithinRoot, pathExists, replacePreviewDirectory } from './preview-reuse-files.ts';

export const AGENT_RUNTIME_FACET = 'agent-runtime';

// Provider sessions, logs and per-run caches stay with their environment. Credentials,
// account profiles and provider configuration remain in the copied tree.
const RUNTIME_NAMES = new Set(['model-bindings', 'tmp', '.tmp', 'logs', 'log', '.cache', 'cache', 'shell-snapshots', 'shell_snapshots', 'sessions', 'thread-writer-locks', 'projects']);
const RUNTIME_FILES = /^(?:logs|thread_history|state|memories|goals|queue)_\d+\.sqlite(?:-(?:wal|shm))?$|^models_cache\.json$/;

function skipRuntimeData(input: { name: string }): boolean {
  return RUNTIME_NAMES.has(input.name) || RUNTIME_FILES.test(input.name) || input.name.startsWith('model-bridge-');
}

function providerDirectories(root: string): string[] {
  const stat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink()) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : error instanceof Error && /^[a-z][a-z0-9_]{0,80}$/.test(error.message)
      ? error.message
      : 'unexpected_error';
}

type AgentRelocationPackage = {
  listConnectionExecutables(input: { sourceRoot: string }): string[];
  relocateConnections(input: { sourceRoot: string; targetRoot: string }): {
    relocated: string[];
    failed: Array<{ provider: string; stage: string; diagnostic: string }>;
  };
};

async function copyPrograms(sourceRoot: string, previewRoot: string, refresh: boolean, executables: string[], now: () => string): Promise<{ outcomes: PreviewReuseFacetOutcome[]; diagnostics: string[] }> {
  const programsRoot = path.join(sourceRoot, 'agent-service', 'programs');
  const providers = new Set<string>();
  for (const executable of executables) {
    const resolved = path.resolve(executable);
    if (!resolved.startsWith(`${path.resolve(programsRoot)}${path.sep}`)) continue;
    const [provider] = path.relative(programsRoot, resolved).split(path.sep);
    if (provider) providers.add(provider);
  }
  const outcomes: PreviewReuseFacetOutcome[] = [];
  const diagnostics: string[] = [];
  for (const provider of [...providers].sort()) {
    const source = path.join(programsRoot, provider);
    const target = path.join(previewRoot, 'agent-service', 'programs', provider);
    assertWithinRoot(previewRoot, target);
    if (!pathExists(source)) { diagnostics.push(`${provider} 程序来源缺失`); continue; }
    const existed = pathExists(target);
    try {
      const result = replacePreviewDirectory({ source, target, refresh });
      outcomes.push({ status: result.replaced ? 'refreshed' : existed ? 'reused' : 'seeded', files: result.stats.files, bytes: result.stats.bytes, diagnostics: [], changedAt: now() });
    } catch (error) {
      diagnostics.push(`${provider} 程序复制失败：${errorCode(error)}`);
    }
  }
  return { outcomes, diagnostics };
}

export function createAgentRuntimeFacet(): PreviewReuseFacet {
  return {
    id: AGENT_RUNTIME_FACET,
    label: '智能体运行时',
    sensitivity: 'credentials',
    defaultFor: true,
    requires: [MODEL_CATALOG_FACET],
    ownership: ['agent-service/model-access', 'agent-service/connections', 'agent-service/programs'],
    exclusions: [...RUNTIME_NAMES],
    async apply(input) {
      return withAgentDataOffline(input.previewRoot, async () => {
      const catalog = input.dependency(MODEL_CATALOG_FACET);
      if (!catalog || catalog.status === 'failed') {
        return { status: 'failed', files: catalog?.files ?? 0, bytes: catalog?.bytes ?? 0, diagnostics: ['智能体运行时失败：模型目录未成功沿用'], changedAt: input.now() };
      }
      const diagnostics: string[] = [...catalog.diagnostics];
      const outcomes: PreviewReuseFacetOutcome[] = [];
      const sourceConnections = path.join(input.sourceRoot, 'agent-service', 'connections');
      const targetConnections = path.join(input.previewRoot, 'agent-service', 'connections');
      for (const provider of providerDirectories(sourceConnections)) {
        const source = path.join(sourceConnections, provider);
        const target = path.join(targetConnections, provider);
        assertWithinRoot(input.previewRoot, target);
        const existed = pathExists(target);
        try {
          const result = replacePreviewDirectory({ source, target, refresh: input.refresh, skip: skipRuntimeData });
          outcomes.push({
            status: result.replaced ? 'refreshed' : existed ? 'reused' : 'seeded',
            files: result.stats.files,
            bytes: result.stats.bytes,
            diagnostics: [],
            changedAt: input.now(),
          });
        } catch (error) {
          diagnostics.push(`${provider} 登录配置复制失败：${errorCode(error)}`);
        }
      }

      const agentPackage = await import('@buildr-ai/buildr-agent') as unknown as AgentRelocationPackage;
      let executables: string[] = [];
      try {
        executables = agentPackage.listConnectionExecutables({ sourceRoot: input.sourceRoot });
      } catch (error) {
        diagnostics.push(`连接程序清单读取失败：${errorCode(error)}`);
      }
      if (executables.length) {
        const programs = await copyPrograms(input.sourceRoot, input.previewRoot, input.refresh, executables, input.now);
        outcomes.push(...programs.outcomes);
        diagnostics.push(...programs.diagnostics);
      }

      try {
        const relocated = agentPackage.relocateConnections({ sourceRoot: input.sourceRoot, targetRoot: input.previewRoot });
        for (const failure of relocated.failed) diagnostics.push(`${failure.provider} 连接重建失败（${failure.stage}）：${failure.diagnostic}`);
      } catch (error) {
        diagnostics.push(`连接重定位失败：${errorCode(error)}`);
      }

      const status: PreviewReuseFacetOutcome['status'] = diagnostics.length
        ? 'failed'
        : outcomes.some((outcome) => outcome.status === 'refreshed') || catalog.status === 'refreshed'
          ? 'refreshed'
          : outcomes.some((outcome) => outcome.status === 'seeded') || catalog.status === 'seeded'
            ? 'seeded'
            : 'reused';
      return {
        status,
        files: outcomes.reduce((total, outcome) => total + outcome.files, catalog.files),
        bytes: outcomes.reduce((total, outcome) => total + outcome.bytes, catalog.bytes),
        diagnostics,
        changedAt: input.now(),
      };
      });
    },
  };
}
