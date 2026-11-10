import type { ModelOffering } from '../contracts.ts';

type OpenAIReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

interface OpenAIModelProfile {
  label: string;
  contextWindow: number;
  maxOutputTokens: number;
  efforts?: OpenAIReasoningEffort[];
  defaultEffort?: OpenAIReasoningEffort;
}

/**
 * Capabilities published on https://developers.openai.com/api/docs/models/<id>
 * as observed on 2026-11-08. The API model list only returns id/object/created/
 * owned_by, so these are the official model-page facts Buildr can rely on.
 * Unknown models stay conservative instead of inheriting a family guess.
 */
const PROFILES: Record<string, OpenAIModelProfile> = {
  'gpt-6.1-sol': { label: 'GPT-6.1-Sol', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
  'gpt-6.1-terra': { label: 'GPT-6.1-Terra', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
  'gpt-6-astra': { label: 'GPT-6-Astra', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  'gpt-6-sol': { label: 'GPT-6-Sol', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
  'gpt-6-luna': { label: 'GPT-6-Luna', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
  'gpt-5.6-sol': { label: 'GPT-5.6-Sol', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
  'gpt-5.6-terra': { label: 'GPT-5.6-Terra', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
  'gpt-5.6-luna': { label: 'GPT-5.6-Luna', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
  'gpt-5.5': { label: 'GPT-5.5', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'gpt-5.5-pro': { label: 'GPT-5.5-Pro', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['medium', 'high', 'xhigh'], defaultEffort: 'high' },
  'gpt-5.4': { label: 'GPT-5.4', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'none' },
  'gpt-5.4-pro': { label: 'GPT-5.4-Pro', contextWindow: 1_050_000, maxOutputTokens: 128_000, efforts: ['medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'gpt-5.4-mini': { label: 'GPT-5.4-Mini', contextWindow: 400_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'none' },
  'gpt-5.4-nano': { label: 'GPT-5.4-Nano', contextWindow: 400_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'none' },
  'gpt-5.3-codex': { label: 'GPT-5.3-Codex', contextWindow: 400_000, maxOutputTokens: 128_000, efforts: ['low', 'medium', 'high', 'xhigh'] },
  'gpt-5.2': { label: 'GPT-5.2', contextWindow: 400_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'none' },
  'gpt-5.2-pro': { label: 'GPT-5.2-Pro', contextWindow: 400_000, maxOutputTokens: 128_000, efforts: ['medium', 'high', 'xhigh'] },
  'gpt-5.1': { label: 'GPT-5.1', contextWindow: 400_000, maxOutputTokens: 128_000, efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'none' },
  'gpt-5': { label: 'GPT-5', contextWindow: 400_000, maxOutputTokens: 128_000, efforts: ['minimal', 'low', 'medium', 'high'] },
  'gpt-5-mini': { label: 'GPT-5-Mini', contextWindow: 400_000, maxOutputTokens: 128_000 },
  'gpt-5-nano': { label: 'GPT-5-Nano', contextWindow: 400_000, maxOutputTokens: 128_000 },
  'gpt-5-pro': { label: 'GPT-5-Pro', contextWindow: 400_000, maxOutputTokens: 272_000, efforts: ['high'], defaultEffort: 'high' },
  'gpt-4.1': { label: 'GPT-4.1', contextWindow: 1_047_576, maxOutputTokens: 32_768 },
  'gpt-4.1-mini': { label: 'GPT-4.1-Mini', contextWindow: 1_047_576, maxOutputTokens: 32_768 },
  'gpt-4o': { label: 'GPT-4o', contextWindow: 128_000, maxOutputTokens: 16_384 },
  'gpt-4o-mini': { label: 'GPT-4o-Mini', contextWindow: 128_000, maxOutputTokens: 16_384 },
  o3: { label: 'o3', contextWindow: 200_000, maxOutputTokens: 100_000 },
};

const VARIANT_SUFFIXES = new Set(['sol', 'terra', 'luna', 'astra', 'pro', 'mini', 'nano', 'codex', 'latest']);

export function openAIBaseModelId(id: string): string {
  return id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

export function openAIModelLabel(id: string): string {
  return id.split('-').map((part, index) => {
    if (index === 0 && part.toLowerCase() === 'gpt') return 'GPT';
    if (index === 0 && part.toLowerCase() === 'chatgpt') return 'ChatGPT';
    if (/^o\d+$/i.test(part)) return part;
    if (!part || !/^[a-z]/i.test(part)) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('-');
}

export function openAIModelFamily(label: string): string {
  const parts = label.split('-');
  if (parts.length > 1 && VARIANT_SUFFIXES.has(parts.at(-1)!.toLowerCase())) parts.pop();
  return parts.join('-');
}

/** Build one catalog row from the official profile, keeping the provider id untouched. */
export function openAIModelOffering(id: string, displayName?: string): ModelOffering {
  const base = openAIBaseModelId(id);
  const profile = PROFILES[base];
  const label = displayName?.trim() || profile?.label || openAIModelLabel(base);
  return {
    id,
    label,
    family: openAIModelFamily(label),
    images: Boolean(profile),
    tools: true,
    ...(profile ? {
      contextWindow: profile.contextWindow,
      reportedContextWindow: profile.contextWindow,
      maxOutputTokens: profile.maxOutputTokens,
      ...(profile.efforts ? {
        reasoningEfforts: profile.efforts.map(effort => ({ id: effort, label: effort })),
        ...(profile.defaultEffort ? { defaultReasoningEffort: profile.defaultEffort } : {}),
      } : {}),
    } : {}),
  };
}
