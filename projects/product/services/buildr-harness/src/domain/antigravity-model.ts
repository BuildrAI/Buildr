export const ANTIGRAVITY_VARIANT_DEPTHS = ['low', 'medium', 'high', 'xhigh'] as const;
export type AntigravityVariantDepth = (typeof ANTIGRAVITY_VARIANT_DEPTHS)[number];

export function antigravityModelVariant(id: string) {
  const match = /^(gemini-4-(?:carbon|argon|hydrogen)|gemini-3\.8-flash|claude-(?:opus|sonnet)-5-5)-(low|medium|high|xhigh)$/.exec(id);
  return match ? { family: match[1]!, depth: match[2] as AntigravityVariantDepth } : undefined;
}

export function antigravityReasoningEffort(depth: string) {
  return { id: depth, label: depth === 'xhigh' ? 'Extra' : depth[0]!.toUpperCase() + depth.slice(1) };
}

export function antigravityModelLabel(id: string, upstreamLabel?: string): string {
  const family = antigravityModelVariant(id)?.family ?? id.replace(/-(low|medium|high|xhigh|tiered)$/, '');
  const claude = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)$/.exec(family);
  const gemini = /^gemini-([\d.]+)-(carbon|argon|hydrogen|flash|pro)(-lite|-thinking)?$/.exec(family);
  if (claude) return `Claude ${claude[1]![0]!.toUpperCase() + claude[1]!.slice(1)} ${claude[2]}.${claude[3]}`;
  if (gemini) {
    const suffix = gemini[3] === '-lite' ? ' Lite' : gemini[3] === '-thinking' ? ' (Thinking)' : '';
    return `Gemini ${gemini[1]} ${gemini[2]![0]!.toUpperCase() + gemini[2]!.slice(1)}${suffix}`;
  }
  if (family === 'gpt-oss-120b') return 'GPT-OSS 120B';
  return upstreamLabel?.replace(/ \((Low|Medium|High|XHigh|Extra|Tiered)\)$/i, '') || family;
}
