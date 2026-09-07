export type ParsedCliArguments = {
  positions: string[];
  has(name: string): boolean;
  one(name: string): string | null;
};

export function parseCliArguments(args: string[], allowed: ReadonlySet<string>, booleanFlags: ReadonlySet<string> = new Set()): ParsedCliArguments {
  const positions: string[] = [];
  const values = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      positions.push(argument);
      continue;
    }
    if (!allowed.has(argument)) throw new Error(`Unknown option: ${argument}`);
    if (booleanFlags.has(argument)) {
      values.set(argument, true);
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    values.set(argument, value);
  }
  return {
    positions,
    has: (name) => values.has(name),
    one: (name) => typeof values.get(name) === 'string' ? values.get(name) as string : null,
  };
}
