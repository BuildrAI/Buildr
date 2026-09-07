export type CommandVersion = [number, number, number];

export type CommandVersionConstraint = {
  operator: '>=' | '>' | '<=' | '<' | '=';
  version: CommandVersion;
  rawVersion: string;
};

export function parseVersionConstraint(constraint: unknown): CommandVersionConstraint | null {
  const match = String(constraint).trim().match(/^(>=|>|<=|<|=)?\s*(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    operator: (match[1] || '=') as CommandVersionConstraint['operator'],
    version: [Number(match[2]), Number(match[3]), Number(match[4])],
    rawVersion: `${match[2]}.${match[3]}.${match[4]}`,
  };
}

export function parseVersion(version: unknown): CommandVersion | null {
  const match = String(version).match(/(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(left: CommandVersion, right: CommandVersion): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

export function versionSatisfies(version: CommandVersion, constraint: CommandVersionConstraint): boolean {
  const comparison = compareVersions(version, constraint.version);
  if (constraint.operator === '>=') return comparison >= 0;
  if (constraint.operator === '>') return comparison > 0;
  if (constraint.operator === '<=') return comparison <= 0;
  if (constraint.operator === '<') return comparison < 0;
  return comparison === 0;
}

export function intersectVersionConstraints(rawConstraints: string[]) {
  const constraints = rawConstraints.filter(Boolean).map((raw) => ({ ...parseVersionConstraint(raw), raw }));
  if (constraints.some((constraint) => !constraint.operator)) return { compatible: false, constraint: null, constraints: rawConstraints };
  let exact: any = null;
  let lower: any = null;
  let upper: any = null;
  for (const constraint of constraints as Array<CommandVersionConstraint & { raw: string }>) {
    if (constraint.operator === '=') {
      if (exact && compareVersions(exact.version, constraint.version) !== 0) return { compatible: false, constraint: null, constraints: rawConstraints };
      exact = constraint;
    } else if (constraint.operator === '>' || constraint.operator === '>=') {
      if (!lower || compareVersions(constraint.version, lower.version) > 0 || (compareVersions(constraint.version, lower.version) === 0 && constraint.operator === '>')) lower = constraint;
    } else if (constraint.operator === '<' || constraint.operator === '<=') {
      if (!upper || compareVersions(constraint.version, upper.version) < 0 || (compareVersions(constraint.version, upper.version) === 0 && constraint.operator === '<')) upper = constraint;
    }
  }
  if (exact && (constraints as Array<CommandVersionConstraint & { raw: string }>).some((constraint) => !versionSatisfies(exact!.version, constraint))) return { compatible: false, constraint: null, constraints: rawConstraints };
  if (lower && upper) {
    const comparison = compareVersions(lower.version, upper.version);
    if (comparison > 0 || (comparison === 0 && (lower.operator === '>' || upper.operator === '<'))) return { compatible: false, constraint: null, constraints: rawConstraints };
  }
  return { compatible: true, constraint: exact?.raw || [lower?.raw, upper?.raw].filter(Boolean).join(' ') || null, constraints: rawConstraints };
}
