// Shared by working-tree and immutable Git input readers. This only resolves
// known execution semantics; unknown dynamic readers retain their fallback.
export function discoveredVerificationFiles(step: any, files: string[]): { selected: string[]; inventory: string[] } {
  const family = step.executor?.file === 'test/verification/system.ts' ? 'test/system/'
    : step.executor?.file === 'test/verification/integration.ts' ? 'test/integration/' : null;
  if (!family) return { selected: [], inventory: [] };
  const integration = family === 'test/integration/';
  const inventory = files.filter(file => file.startsWith(family) && (integration
    ? !file.slice(family.length).includes('/') && file.endsWith('.test.ts')
    : /\.test\.[cm]?[jt]sx?$/u.test(file))).sort();
  // The general runner reads only top-level *.test.ts files and excludes the
  // exact delegated members declared beside it. Their content and existence
  // belong to those owners; a real import can still add them as dependencies.
  const discovered = integration
    ? inventory.filter(file => !(step.executor.excludedFiles ?? []).includes(file))
    : inventory;
  // The executor's declaration is derived from the same suite registry used by
  // the runner, not from changed-path ownership. Unknown callers bind all files.
  return { selected: step.executor.discoveredFiles ?? discovered, inventory: discovered };
}

export function verificationEntryFiles(executor: any): string[] {
  if (executor.file) return [executor.file];
  if (executor.type === 'workspace-suite' && /^[a-z][a-z-]+$/u.test(executor.selector)) return [`test/verification/workspace/${executor.selector}.ts`];
  if (executor.type === 'package-selector') return ['test/verification/package/run.ts'];
  return [];
}

export function literalUrlImports(source: string): { imports: string[]; remainder: string } {
  const imports: string[] = [];
  const remainder = source.replace(/\bimport\s*\(\s*new\s+URL\s*\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)\.href\s*\)/gu,
    (_match, _quote, file) => { imports.push(file); return ''; });
  return { imports, remainder };
}

/** Module discovery reads executable tokens, not imports inside generated files,
 * comments or fixture strings. Template interpolations remain executable. */
export function executableModuleInputs(source: string): { imports: string[]; children: string[]; computed: boolean } {
  type Token = { value: string; string?: boolean };
  const tokens: Token[] = [];
  let index = 0;
  const code = (nested = false) => {
    let braces = 0;
    while (index < source.length) {
      const char = source[index]!;
      if (/\s/u.test(char)) { index++; continue; }
      if (source.startsWith('//', index)) { while (index < source.length && source[index] !== '\n') index++; continue; }
      if (source.startsWith('/*', index)) { const end = source.indexOf('*/', index + 2); index = end < 0 ? source.length : end + 2; continue; }
      if (char === '"' || char === "'") {
        const quote = char, start = ++index;
        while (index < source.length && source[index] !== quote) { if (source[index] === '\\') index++; index++; }
        tokens.push({ value: source.slice(start, index), string: true }); index++; continue;
      }
      if (char === '`') {
        index++;
        while (index < source.length && source[index] !== '`') {
          if (source[index] === '\\') { index += 2; continue; }
          if (source.startsWith('${', index)) { index += 2; code(true); continue; }
          index++;
        }
        index++; tokens.push({ value: 'template' }); continue;
      }
      // A regex following an expression prefix cannot contain executable imports.
      // Ambiguous slashes remain visible, retaining conservative false positives.
      const previous = tokens.at(-1)?.value;
      if (char === '/' && (!previous || ['=', '(', '[', '{', ',', ':', ';', '!', '?', 'return', 'throw', 'case', '=>'].includes(previous))) {
        index++; let bracket = false;
        while (index < source.length) {
          const value = source[index++]!;
          if (value === '\\') { index++; continue; }
          if (value === '[') bracket = true;
          if (value === ']') bracket = false;
          if (value === '/' && !bracket) break;
        }
        while (/[a-z]/iu.test(source[index] ?? '')) index++;
        tokens.push({ value: 'regex' }); continue;
      }
      if (char === '}' && nested && braces === 0) { index++; return; }
      if (char === '{') braces++;
      if (char === '}') braces--;
      const word = /^[a-zA-Z_$][\w$]*/u.exec(source.slice(index));
      if (word) { tokens.push({ value: word[0] }); index += word[0].length; }
      else { tokens.push({ value: char }); index++; }
    }
  };
  code();
  const imports = new Set<string>(), children = new Set<string>();
  let computed = false;
  for (let cursor = 0; cursor < tokens.length; cursor++) {
    const token = tokens[cursor]!;
    if (token.string) {
      if (/^(?:test|tools)\/[^\n]+\.[cm]?[jt]sx?$/u.test(token.value)) children.add(token.value);
      continue;
    }
    if (token.value === 'from' && tokens[cursor + 1]?.string) imports.add(tokens[cursor + 1]!.value);
    if (!['import', 'require'].includes(token.value)) continue;
    const next = tokens[cursor + 1];
    if (next?.string) { imports.add(next.value); continue; }
    if (next?.value !== '(') continue;
    const argument = tokens[cursor + 2];
    if (argument?.string && tokens[cursor + 3]?.value === ')') { imports.add(argument.value); continue; }
    const url = tokens.slice(cursor + 2, cursor + 16);
    if (url[0]?.value === 'new' && url[1]?.value === 'URL' && url[2]?.value === '(' && url[3]?.string
      && url.slice(4).map(token => token.value).join('') === ',import.meta.url).href)') {
      imports.add(url[3]!.value); continue;
    }
    computed = true;
  }
  return { imports: [...imports], children: [...children], computed };
}
