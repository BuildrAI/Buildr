import {
  ANTIGRAVITY_VARIANT_DEPTHS,
  antigravityModelLabel,
  antigravityModelVariant,
  antigravityReasoningEffort,
} from '../../domain/antigravity-model.ts';
import { ModelAccessError, type ModelOffering } from '../contracts.ts';

interface CliProxyCatalogEntry {
  id: string;
  object: 'model';
  owned_by: 'antigravity';
  type: 'antigravity';
  display_name: string;
  name: string;
  description: string;
  context_length?: number;
  max_completion_tokens?: number;
  supports_web_search?: boolean;
  thinking?: {
    min?: number;
    max?: number;
    zero_allowed?: boolean;
    dynamic_allowed?: boolean;
    levels?: readonly string[];
  };
  supportedInputModalities: readonly string[];
  supportedOutputModalities: readonly string[];
  native_capabilities?: { web_search?: boolean };
}

const GEMINI_MODALITIES = ['text', 'image', 'audio', 'video'] as const;
const CLAUDE_MODALITIES = ['text', 'image'] as const;
const TEXT_OUTPUT = ['text'] as const;

function depthTitle(depth: string): string {
  return depth === 'xhigh' ? 'XHigh' : depth[0]!.toUpperCase() + depth.slice(1);
}

function geminiVariantEntries(
  family: string,
  title: string,
  depths: readonly string[],
  maxCompletionTokens: number,
): CliProxyCatalogEntry[] {
  return depths.map(depth => {
    const id = `${family}-${depth}`;
    return {
      id,
      object: 'model',
      owned_by: 'antigravity',
      type: 'antigravity',
      supports_web_search: true,
      display_name: `${title} (${depthTitle(depth)})`,
      name: id,
      description: `${title} (${depthTitle(depth)})`,
      context_length: 1_048_576,
      max_completion_tokens: maxCompletionTokens,
      thinking: {
        min: 1,
        max: 65_535,
        dynamic_allowed: true,
        levels: depths,
      },
      supportedInputModalities: GEMINI_MODALITIES,
      supportedOutputModalities: TEXT_OUTPUT,
      native_capabilities: { web_search: true },
    };
  });
}

function claudeVariantEntries(
  family: string,
  title: string,
  depths: readonly string[],
): CliProxyCatalogEntry[] {
  return depths.map(depth => {
    const id = `${family}-${depth}`;
    return {
      id,
      object: 'model',
      owned_by: 'antigravity',
      type: 'antigravity',
      display_name: `${title} (${depthTitle(depth)})`,
      name: id,
      description: `${title} (${depthTitle(depth)})`,
      context_length: 1_000_000,
      max_completion_tokens: 128_000,
      thinking: {
        min: 1_024,
        max: 64_000,
        zero_allowed: true,
        dynamic_allowed: true,
        levels: depths,
      },
      supportedInputModalities: CLAUDE_MODALITIES,
      supportedOutputModalities: TEXT_OUTPUT,
    };
  });
}

function geminiBaseEntry(
  id: string,
  title: string,
  maxCompletionTokens = 65_536,
  levels?: readonly string[],
): CliProxyCatalogEntry {
  return {
    id,
    object: 'model',
    owned_by: 'antigravity',
    type: 'antigravity',
    supports_web_search: true,
    display_name: title,
    name: id,
    description: title,
    context_length: 1_048_576,
    max_completion_tokens: maxCompletionTokens,
    thinking: {
      min: 1,
      max: 65_535,
      zero_allowed: true,
      dynamic_allowed: true,
      ...(levels ? { levels } : {}),
    },
    supportedInputModalities: GEMINI_MODALITIES,
    supportedOutputModalities: TEXT_OUTPUT,
    native_capabilities: { web_search: true },
  };
}

/**
 * Complete Antigravity static catalog supplied to CLIProxyAPI via `models.catalog`.
 * CLIProxyAPI intersects this list with each account's `antigravity_capability_hints.model_ids`,
 * so only upstream model IDs genuinely entitled on the user's account are exposed.
 */
export const GOOGLE_AI_ANTIGRAVITY_CATALOG: { readonly antigravity: readonly CliProxyCatalogEntry[] } = {
  antigravity: [
    ...geminiVariantEntries('gemini-4-carbon', 'Gemini 4 Carbon', ['low', 'medium', 'high'], 1_048_576),
    ...geminiVariantEntries('gemini-4-argon', 'Gemini 4 Argon', ['low', 'medium', 'high'], 1_048_576),
    ...geminiVariantEntries('gemini-4-hydrogen', 'Gemini 4 Hydrogen', ['low', 'medium', 'high', 'xhigh'], 1_048_576),
    ...geminiVariantEntries('gemini-3.8-flash', 'Gemini 3.8 Flash', ['low', 'medium', 'high'], 65_536),
    geminiBaseEntry('gemini-3.8-flash-tiered', 'Gemini 3.8 Flash (Tiered)', 65_536, ['low', 'medium', 'high']),
    ...claudeVariantEntries('claude-opus-5-5', 'Claude Opus 5.5', ['low', 'medium', 'high']),
    ...claudeVariantEntries('claude-sonnet-5-5', 'Claude Sonnet 5.5', ['low', 'medium', 'high']),
    {
      id: 'claude-opus-4-6-thinking',
      object: 'model',
      owned_by: 'antigravity',
      type: 'antigravity',
      display_name: 'Claude Opus 4.6 (Thinking)',
      name: 'claude-opus-4-6-thinking',
      description: 'Claude Opus 4.6 (Thinking)',
      context_length: 200_000,
      max_completion_tokens: 64_000,
      thinking: { min: 1_024, max: 64_000, zero_allowed: true, dynamic_allowed: true },
      supportedInputModalities: CLAUDE_MODALITIES,
      supportedOutputModalities: TEXT_OUTPUT,
    },
    {
      id: 'claude-sonnet-4-6',
      object: 'model',
      owned_by: 'antigravity',
      type: 'antigravity',
      display_name: 'Claude Sonnet 4.6 (Thinking)',
      name: 'claude-sonnet-4-6',
      description: 'Claude Sonnet 4.6 (Thinking)',
      context_length: 200_000,
      max_completion_tokens: 64_000,
      thinking: { min: 1_024, max: 64_000, zero_allowed: true, dynamic_allowed: true },
      supportedInputModalities: CLAUDE_MODALITIES,
      supportedOutputModalities: TEXT_OUTPUT,
    },
    geminiBaseEntry('gemini-3-flash', 'Gemini 3 Flash', 65_536, ['minimal', 'low', 'medium', 'high']),
    geminiBaseEntry('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 65_535, ['minimal', 'low', 'medium', 'high']),
    geminiBaseEntry('gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 65_535, ['minimal', 'low', 'medium', 'high']),
    geminiBaseEntry('gemini-2.5-pro', 'Gemini 2.5 Pro', 65_536),
    geminiBaseEntry('gemini-2.5-flash', 'Gemini 2.5 Flash', 65_536),
    geminiBaseEntry('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 65_536),
    geminiBaseEntry('gemini-2.5-flash-thinking', 'Gemini 2.5 Flash (Thinking)', 65_536),
    {
      id: 'gpt-oss-120b-medium',
      object: 'model',
      owned_by: 'antigravity',
      type: 'antigravity',
      display_name: 'GPT-OSS 120B (Medium)',
      name: 'gpt-oss-120b-medium',
      description: 'GPT-OSS 120B (Medium)',
      context_length: 114_000,
      max_completion_tokens: 32_768,
      supportedInputModalities: ['text'],
      supportedOutputModalities: TEXT_OUTPUT,
    },
  ],
};

export interface GoogleAiRouteTable {
  readonly models: ModelOffering[];
  readonly variantsByModel: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly directModels: ReadonlySet<string>;
}

export function googleAiModelAlias(modelId: string): string | undefined {
  if (modelId === 'gemini-3.8-flash-tiered') return 'gemini-3.8-flash';
  return antigravityModelVariant(modelId)?.family;
}

function sortDepths(depths: Iterable<string>): string[] {
  return [...depths].sort((a, b) => {
    const ia = ANTIGRAVITY_VARIANT_DEPTHS.indexOf(a as (typeof ANTIGRAVITY_VARIANT_DEPTHS)[number]);
    const ib = ANTIGRAVITY_VARIANT_DEPTHS.indexOf(b as (typeof ANTIGRAVITY_VARIANT_DEPTHS)[number]);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
}

function pickDefaultDepth(sortedDepths: readonly string[]): string | undefined {
  if (!sortedDepths.length) return undefined;
  return sortedDepths.includes('medium') ? 'medium' : sortedDepths.at(-1);
}

/**
 * Aggregate `/v1/models` entries into series-level offerings and an exact
 * `(modelId, reasoningEffort) -> upstreamModelId` routing table.
 */
export function buildGoogleAiRouteTable(data: unknown): GoogleAiRouteTable {
  const rows = Array.isArray(data) ? data : [];
  const seenUpstreamIds = new Set<string>();
  const normalizedRows: Array<{ id: string; upstreamLabel?: string }> = [];

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as { id?: unknown; display_name?: unknown; name?: unknown };
    if (typeof row.id !== 'string' || seenUpstreamIds.has(row.id)) continue;
    if (!/^(gemini|claude|gpt|carbon)(?:[-_.]|$)/i.test(row.id)) continue;
    if (/-image(?:-|$)/i.test(row.id)) continue;
    seenUpstreamIds.add(row.id);
    const upstreamLabel = row.display_name ?? row.name;
    normalizedRows.push({
      id: row.id,
      upstreamLabel: typeof upstreamLabel === 'string' ? upstreamLabel : undefined,
    });
  }

  const hasFlashVariant = [...seenUpstreamIds].some(id => antigravityModelVariant(id)?.family === 'gemini-3.8-flash');
  const variantsByModel = new Map<string, Map<string, string>>();
  const directModels = new Set<string>();
  const metaByModel = new Map<string, { label: string; images: boolean }>();
  const orderedIds: string[] = [];

  const registerMeta = (modelId: string, label: string, images: boolean) => {
    if (!metaByModel.has(modelId)) {
      metaByModel.set(modelId, { label, images });
      orderedIds.push(modelId);
    }
  };

  for (const row of normalizedRows) {
    if (row.id === 'gemini-3.8-flash-tiered' && hasFlashVariant) continue;
    const variant = antigravityModelVariant(row.id);
    if (variant) {
      const label = antigravityModelLabel(variant.family, row.upstreamLabel);
      registerMeta(variant.family, label, !/^gpt-/i.test(variant.family));
      let depths = variantsByModel.get(variant.family);
      if (!depths) {
        depths = new Map();
        variantsByModel.set(variant.family, depths);
      }
      depths.set(variant.depth, row.id);
      continue;
    }

    const fixedDepth = /-(low|medium|high|xhigh)$/.exec(row.id)?.[1];
    const label = antigravityModelLabel(row.id, row.upstreamLabel);
    registerMeta(row.id, label, !/^gpt-/i.test(row.id));
    if (fixedDepth) {
      variantsByModel.set(row.id, new Map([[fixedDepth, row.id]]));
    } else {
      directModels.add(row.id);
    }
  }

  const models: ModelOffering[] = orderedIds.map(id => {
    const meta = metaByModel.get(id)!;
    const depthMap = variantsByModel.get(id);
    const sorted = depthMap ? sortDepths(depthMap.keys()) : [];
    return {
      id,
      label: meta.label,
      tools: true,
      images: meta.images,
      ...(sorted.length
        ? {
            reasoningEfforts: sorted.map(antigravityReasoningEffort),
            defaultReasoningEffort: pickDefaultDepth(sorted),
          }
        : {}),
    };
  });

  return { models, variantsByModel, directModels };
}

/** Resolve `(modelId, effort)` to the exact upstream model ID expected by Google CloudCode / CLIProxyAPI. */
export function resolveGoogleAiUpstreamModel(
  table: GoogleAiRouteTable,
  requestedModelId: string,
  requestedEffort: unknown,
): string {
  const legacy = antigravityModelVariant(requestedModelId);
  const canonicalId = table.variantsByModel.has(requestedModelId) || table.directModels.has(requestedModelId)
    ? requestedModelId
    : (googleAiModelAlias(requestedModelId) ?? requestedModelId);
  const effectiveEffort = requestedEffort ?? legacy?.depth;

  const depthMap = table.variantsByModel.get(canonicalId);
  if (depthMap) {
    const sorted = sortDepths(depthMap.keys());
    const chosen = effectiveEffort ?? pickDefaultDepth(sorted);
    if (typeof chosen !== 'string' || !depthMap.has(chosen)) {
      throw new ModelAccessError('agent_reasoning_unavailable', '该模型不支持所选思考深度。', 400);
    }
    return depthMap.get(chosen)!;
  }

  if (table.directModels.has(canonicalId)) {
    if (effectiveEffort !== undefined) {
      throw new ModelAccessError('agent_reasoning_unavailable', '该模型不支持所选思考深度。', 400);
    }
    return canonicalId;
  }

  throw new ModelAccessError('model_unavailable', '所选模型不在账号当前目录中。', 409);
}
