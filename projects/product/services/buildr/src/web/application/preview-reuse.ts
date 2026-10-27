import fs from 'node:fs';
import path from 'node:path';

import { defaultWebDataRoot } from '../../modules/installation/contracts/web-profile.ts';
import { createAgentRuntimeFacet } from './preview-reuse-agent-runtime.ts';
import { createModelCatalogFacet } from './preview-reuse-model-catalog.ts';

export const PREVIEW_REUSE_SCHEMA = 'buildr.preview-reuse/v1';
export const PREVIEW_REUSE_SOURCES = Object.freeze(['development'] as const);

export type PreviewReuseSourceId = (typeof PREVIEW_REUSE_SOURCES)[number];
export type PreviewReuseFacetStatus = 'seeded' | 'reused' | 'refreshed' | 'failed';

export type PreviewReuseFacetOutcome = {
  status: PreviewReuseFacetStatus;
  files: number;
  bytes: number;
  diagnostics: string[];
  changedAt: string;
};

export type PreviewReuseFacetInput = {
  sourceRoot: string;
  previewRoot: string;
  refresh: boolean;
  now(): string;
  dependency(id: string): PreviewReuseFacetOutcome | undefined;
};

export type PreviewReuseFacet = {
  id: string;
  label: string;
  sensitivity: 'metadata' | 'credentials';
  defaultFor: boolean;
  requires?: readonly string[];
  /** Paths owned below the preview instance root; refresh never touches anything else. */
  ownership: readonly string[];
  /** Provider runtime artifacts intentionally excluded from the source snapshot. */
  exclusions?: readonly string[];
  apply(input: PreviewReuseFacetInput): Promise<PreviewReuseFacetOutcome>;
};

export type PreviewReuseSelection = {
  source: PreviewReuseSourceId;
  requestedFacets: string[];
  facets: string[];
};

export type PreviewReuseFacetFact = PreviewReuseFacetOutcome & { id: string; label: string };

export type PreviewReuseFacts = {
  schemaVersion: typeof PREVIEW_REUSE_SCHEMA;
  source: PreviewReuseSourceId;
  facets: string[];
  seededAt: string | null;
  refreshedAt: string | null;
  appliedAt: string;
  results: PreviewReuseFacetFact[];
};

export type PreviewReuseSource = { id: PreviewReuseSourceId; root: string };

export type ReuseError = Error & { code: string; details?: unknown };

export function previewReuseError(message: string, code: string, details?: unknown): ReuseError {
  const error = Object.assign(new Error(message), { code }) as ReuseError;
  if (details !== undefined) error.details = details;
  return error;
}

export function defaultPreviewReuseFacets(): readonly PreviewReuseFacet[] {
  return Object.freeze([createModelCatalogFacet(), createAgentRuntimeFacet()]);
}

function facetIndex(registry: readonly PreviewReuseFacet[]): Map<string, PreviewReuseFacet> {
  const index = new Map<string, PreviewReuseFacet>();
  for (const facet of registry) {
    if (!/^[a-z][a-z0-9-]*$/.test(facet.id)) throw previewReuseError('沿用 facet 标识无效。', 'preview_reuse_registry_invalid', { facet: facet.id });
    if (index.has(facet.id)) throw previewReuseError('沿用 facet 标识重复。', 'preview_reuse_registry_invalid', { facet: facet.id });
    index.set(facet.id, facet);
  }
  for (const facet of registry) {
    for (const dependency of facet.requires ?? []) {
      if (!index.has(dependency)) throw previewReuseError('沿用 facet 依赖缺失。', 'preview_reuse_registry_invalid', { facet: facet.id, dependency });
    }
  }
  return index;
}

export function parsePreviewReuseSelection(value: string, registry: readonly PreviewReuseFacet[] = defaultPreviewReuseFacets()): PreviewReuseSelection {
  const index = facetIndex(registry);
  const raw = String(value ?? '').trim();
  const separator = raw.indexOf(':');
  const sourceName = (separator < 0 ? raw : raw.slice(0, separator)).trim();
  if (!PREVIEW_REUSE_SOURCES.includes(sourceName as PreviewReuseSourceId)) {
    throw previewReuseError(`--reuse 来源无效：${sourceName || '(空)'}。`, 'preview_reuse_invalid', { argument: '--reuse', source: sourceName || null, reason: 'source_unknown' });
  }
  const source = sourceName as PreviewReuseSourceId;
  const requested = separator < 0
    ? registry.filter((facet) => facet.defaultFor).map((facet) => facet.id)
    : raw.slice(separator + 1).split(',').map((facet) => facet.trim());
  if (!requested.length || requested.some((facet) => !facet)) {
    throw previewReuseError('--reuse 需要至少声明一个 facet。', 'preview_reuse_invalid', { argument: '--reuse', source, reason: 'facets_empty' });
  }
  const requestedFacets = [...new Set(requested)];
  for (const id of requestedFacets) {
    if (!index.has(id)) throw previewReuseError(`--reuse 包含未知 facet：${id}。`, 'preview_reuse_invalid', { argument: '--reuse', source, facet: id, reason: 'facet_unknown' });
  }
  // Dependencies become explicit results; execution follows a stable topological order.
  const expanded = new Set<string>();
  const include = (id: string): void => {
    if (expanded.has(id)) return;
    expanded.add(id);
    for (const dependency of index.get(id)?.requires ?? []) include(dependency);
  };
  for (const id of requestedFacets) include(id);
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (ordered.includes(id)) return;
    if (visiting.has(id)) throw previewReuseError('沿用 facet 依赖形成循环。', 'preview_reuse_registry_invalid', { facet: id });
    visiting.add(id);
    for (const dependency of index.get(id)?.requires ?? []) visit(dependency);
    visiting.delete(id);
    ordered.push(id);
  };
  for (const facet of registry) if (expanded.has(facet.id)) visit(facet.id);
  return {
    source,
    requestedFacets,
    facets: ordered,
  };
}

export function resolvePreviewReuseSource(
  source: PreviewReuseSourceId,
  options: { env?: NodeJS.ProcessEnv; home?: string; platform?: NodeJS.Platform } = {},
): PreviewReuseSource {
  if (source !== 'development') throw previewReuseError(`预览沿用来源不受支持：${source}。`, 'preview_reuse_source_unavailable', { source });
  const root = defaultWebDataRoot(source, options);
  const stat = fs.statSync(root, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) throw previewReuseError('预览沿用来源 development 不可用：开发版应用数据根不存在。', 'preview_reuse_source_unavailable', { source });
  try { fs.accessSync(root, fs.constants.R_OK | fs.constants.X_OK); }
  catch { throw previewReuseError('预览沿用来源 development 不可读。', 'preview_reuse_source_unavailable', { source }); }
  return { id: source, root: path.resolve(root) };
}

export function readPreviewReuseFacts(value: unknown): PreviewReuseFacts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.schemaVersion !== PREVIEW_REUSE_SCHEMA) return null;
  if (!PREVIEW_REUSE_SOURCES.includes(item.source as PreviewReuseSourceId)) return null;
  if (!Array.isArray(item.facets) || !item.facets.every((facet) => typeof facet === 'string')) return null;
  if (!Array.isArray(item.results)) return null;
  const results: PreviewReuseFacetFact[] = [];
  for (const entry of item.results) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const result = entry as Record<string, unknown>;
    if (typeof result.id !== 'string' || typeof result.label !== 'string') return null;
    if (!['seeded', 'reused', 'refreshed', 'failed'].includes(String(result.status))) return null;
    if (!Number.isInteger(result.files) || !Number.isInteger(result.bytes)) return null;
    results.push({
      id: result.id,
      label: result.label,
      status: result.status as PreviewReuseFacetStatus,
      files: Number(result.files),
      bytes: Number(result.bytes),
      diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics.filter((text): text is string => typeof text === 'string') : [],
      changedAt: typeof result.changedAt === 'string' ? result.changedAt : '',
    });
  }
  return {
    schemaVersion: PREVIEW_REUSE_SCHEMA,
    source: item.source as PreviewReuseSourceId,
    facets: item.facets as string[],
    seededAt: typeof item.seededAt === 'string' ? item.seededAt : null,
    refreshedAt: typeof item.refreshedAt === 'string' ? item.refreshedAt : null,
    appliedAt: typeof item.appliedAt === 'string' ? item.appliedAt : '',
    results,
  };
}

function safeDiagnostic(error: unknown, label: string): string {
  const known = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,80}$/.test(error.code)
    ? error.code
    : error instanceof Error && /^[a-z][a-z0-9_]{0,80}$/.test(error.message)
      ? error.message
      : 'unexpected_error';
  return `${label}失败：${known}`;
}

export async function applyPreviewReuse(input: {
  selection: PreviewReuseSelection;
  sourceRoot: string;
  previewRoot: string;
  refresh?: boolean;
  previous?: PreviewReuseFacts | null;
  registry?: readonly PreviewReuseFacet[];
  now?: () => Date;
}): Promise<PreviewReuseFacts> {
  const registry = input.registry ?? defaultPreviewReuseFacets();
  const index = facetIndex(registry);
  const now = (): string => (input.now?.() ?? new Date()).toISOString();
  const outcomes = new Map<string, PreviewReuseFacetOutcome>();
  for (const id of input.selection.facets) {
    const facet = index.get(id);
    if (!facet) continue;
    let outcome: PreviewReuseFacetOutcome;
    try {
      outcome = await facet.apply({
        sourceRoot: input.sourceRoot,
        previewRoot: input.previewRoot,
        refresh: input.refresh === true,
        now,
        dependency: (dependency) => outcomes.get(dependency),
      });
    } catch (error) {
      outcome = { status: 'failed', files: 0, bytes: 0, diagnostics: [safeDiagnostic(error, facet.label)], changedAt: now() };
    }
    outcomes.set(id, outcome);
  }
  const results: PreviewReuseFacetFact[] = input.selection.facets
    .filter((id) => outcomes.has(id) && index.has(id))
    .map((id) => ({ id, label: index.get(id)!.label, ...outcomes.get(id)! }));
  const seeded = results.find((result) => result.status === 'seeded');
  const refreshed = [...results].reverse().find((result) => result.status === 'refreshed');
  return {
    schemaVersion: PREVIEW_REUSE_SCHEMA,
    source: input.selection.source,
    facets: results.map((result) => result.id),
    seededAt: input.previous?.seededAt ?? seeded?.changedAt ?? null,
    refreshedAt: refreshed?.changedAt ?? input.previous?.refreshedAt ?? null,
    appliedAt: now(),
    results,
  };
}
