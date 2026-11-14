export function antigravityModelVariant(id: string) {
  const match = /^(gemini-4-(?:carbon|argon|hydrogen)|gemini-3\.8-flash|claude-(?:opus|sonnet)-5-5)-(low|medium|high|xhigh)$/.exec(id);
  return match ? { family: match[1]!, depth: match[2]! } : undefined;
}
