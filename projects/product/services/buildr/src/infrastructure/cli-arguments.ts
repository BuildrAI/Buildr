export function assertNoUnknownOptions(args: string[], allowedFlags: ReadonlySet<string>, booleanFlags: ReadonlySet<string> = new Set()): void {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) continue;
    if (!allowedFlags.has(argument)) throw new Error(`Unknown argument: ${argument}`);
    if (!booleanFlags.has(argument)) index += 1;
  }
}

const POSITIONAL_BOOLEAN_FLAGS = new Set(['--replace', '--ignore-unsupported', '--keep-file', '--json', '--include-info', '--verbose']);

export function positionalArgs(args: string[], booleanFlags: ReadonlySet<string> = POSITIONAL_BOOLEAN_FLAGS): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      result.push(argument);
      continue;
    }
    if (!booleanFlags.has(argument)) index += 1;
  }
  return result;
}
import path from 'node:path';
import process from 'node:process';

export function optionValue(args: string[], name: string, fallback: any = null): any {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

export function optionValueRaw(args: string[], name: string, fallback: any = null): any {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (value === undefined) throw new Error(`Missing value for ${name}`);
  return value;
}

export function withResolvedTarget(args: string[]): { args: string[]; targetRoot: string } {
  const nextArgs = [...args];
  const targetRoot = path.resolve(optionValue(nextArgs, '--target', process.cwd()));
  const index = nextArgs.indexOf('--target');
  if (index === -1) nextArgs.push('--target', targetRoot);
  else nextArgs[index + 1] = targetRoot;
  return { args: nextArgs, targetRoot };
}

export function withOption(args: string[], name: string, value: string): string[] {
  const nextArgs = [...args];
  const index = nextArgs.indexOf(name);
  if (index === -1) nextArgs.push(name, value);
  else nextArgs[index + 1] = value;
  return nextArgs;
}

export function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}
