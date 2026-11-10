/** Shared fact comparison. Round, origin and platform adoption remain caller policies. */
export interface VerificationInputIdentity {
  key: string; stepId: string; contentIdentity: string; recipeIdentity: string; environmentIdentity: string; gitIdentity?: string;
}
export function verificationInputApplicability(previous: VerificationInputIdentity | null | undefined, current: VerificationInputIdentity | null | undefined): { applicable: boolean; reasons: string[] } {
  if (!previous || !current) return { applicable: false, reasons: ['inputs-unavailable'] };
  const reasons: string[] = [];
  for (const [field, reason] of [['stepId', 'check-changed'], ['contentIdentity', 'product-input-changed'], ['recipeIdentity', 'check-recipe-changed'],
    ['environmentIdentity', 'environment-changed'], ['gitIdentity', 'git-input-changed']] as const) {
    if (previous[field] !== current[field]) reasons.push(reason);
  }
  if (!reasons.length && previous.key !== current.key) reasons.push('identity-invalid');
  return { applicable: !reasons.length, reasons };
}
