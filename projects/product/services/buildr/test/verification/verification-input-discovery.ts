import { stripTypeScriptTypes } from 'node:module';

let parseModule: any;
const syntaxCache = new Map<string, any>();

// Shared by working-tree and immutable Git input readers. This only resolves
// known execution semantics; unknown dynamic readers retain their fallback.
export function discoveredVerificationFiles(step: any, files: string[]): { selected: string[]; inventory: string[] } {
  if (step.executor?.file !== 'test/verification/journeys.ts') return { selected: [], inventory: [] };
  const inventory = files.filter(file => /^test\/(?:integration|e2e)\/.*\.test\.[cm]?[jt]sx?$/u.test(file)).sort();
  // The declared members come from the same Journey registry as execution.
  // Inventory changes stay visible, without importing unrelated assertions.
  return { selected: step.executor.discoveredFiles ?? inventory, inventory };
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

/** A named import consumes its declaration and local dependencies, rather than
 * every unrelated export in a shared verification helper. Entry files and
 * unknown/namespace imports keep the entire module. Executable top-level
 * statements are always retained. This never narrows product runtime bytes. */
export function verificationModuleSlice(source: string, names: Set<string> | null): {
  text: string; imports: Map<string, Set<string> | null>;
} {
  // Node already embeds a JavaScript parser. Type erasure preserves source
  // positions, so source planning needs no Web installation or new dependency.
  // If a future Node omits it, retain the complete module conservatively.
  let file: any;
  try {
    if (!parseModule) {
      const native = (process as any).binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
      if (typeof native !== 'string') throw new Error('Embedded parser unavailable.');
      const module = { exports: {} as any };
      new Function('exports', 'module', native)(module.exports, module);
      parseModule = module.exports.parse;
    }
    file = syntaxCache.get(source);
    if (!file) { file = parseModule(stripTypeScriptTypes(source), { sourceType: 'module', ecmaVersion: 'latest' }); syntaxCache.set(source, file); }
  } catch {
    return { text: source, imports: new Map(executableModuleInputs(source).imports.map(target => [target, null])) };
  }
  const imports = new Map<string, Set<string> | null>();
  const importNames = new Map<string, { target: string; name: string | null }>();
  const declarations = new Map<string, any>();
  const selected = new Set<any>();
  const visit = (node: any, action: (node: any) => void) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') action(node);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'comments', 'tokens', 'extra'].includes(key)) continue;
      if (Array.isArray(value)) for (const child of value) visit(child, action);
      else if (value && typeof value === 'object') visit(value, action);
    }
  };
  const identifiers = (node: any): Set<string> => {
    const found = new Set<string>(); visit(node, child => { if (child.type === 'Identifier') found.add(child.name); }); return found;
  };
  const bind = (node: any, statement: any) => { for (const name of identifiers(node)) declarations.set(name, statement); };
  const pure = (node: any): boolean => {
    if (!node || typeof node !== 'object') return true;
    if (['ArrowFunctionExpression', 'FunctionExpression'].includes(node.type)) return true;
    if (node.type === 'CallExpression' && source.slice(node.callee.start, node.callee.end) !== 'Object.freeze') return false;
    if (node.type === 'NewExpression' && !['Set', 'Map', 'RegExp', 'URL'].includes(node.callee.name)) return false;
    if (['AwaitExpression', 'UpdateExpression', 'AssignmentExpression', 'UnaryExpression'].includes(node.type)) return false;
    return Object.entries(node).every(([key, value]) => ['loc', 'comments', 'extra'].includes(key) || (Array.isArray(value) ? value.every(pure) : pure(value)));
  };
  for (const statement of file.body) {
    const declaration = ['ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(statement.type) ? statement.declaration : statement;
    if (!declaration) { selected.add(statement); continue; }
    if (declaration.type === 'ImportDeclaration') {
      const target = declaration.source.value;
      if (!declaration.specifiers.length) imports.set(target, null);
      if (declaration.importKind === 'type') continue;
      for (const item of declaration.specifiers) if (item.importKind !== 'type') importNames.set(item.local.name, {
        target, name: item.type === 'ImportDefaultSpecifier' ? 'default' : item.type === 'ImportNamespaceSpecifier' ? null : item.imported.name ?? item.imported.value,
      });
    } else if (declaration.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) bind(item.id, statement);
      if (!pure(declaration)) selected.add(statement);
    } else if (['FunctionDeclaration', 'ClassDeclaration', 'TSEnumDeclaration'].includes(declaration.type)) {
      if (declaration.id) declarations.set(declaration.id.name, statement);
      if (statement.type === 'ExportDefaultDeclaration') declarations.set('default', statement);
      if (declaration.type !== 'FunctionDeclaration') selected.add(statement);
    } else if (!['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'].includes(declaration.type)) selected.add(statement);
  }
  const pending = names ? [...names] : [...declarations.keys(), ...importNames.keys()];
  if (!names) for (const statement of file.body) selected.add(statement);
  for (const statement of selected) pending.push(...identifiers(statement));
  const visited = new Set<string>();
  while (pending.length) {
    const name = pending.pop()!;
    if (visited.has(name)) continue;
    visited.add(name);
    const imported = importNames.get(name);
    if (imported) {
      if (imported.name === null) imports.set(imported.target, null);
      else if (imports.get(imported.target) !== null) {
        const members = imports.get(imported.target) ?? new Set<string>(); members.add(imported.name); imports.set(imported.target, members);
      }
    }
    const declaration = declarations.get(name);
    if (declaration && !selected.has(declaration)) { selected.add(declaration); pending.push(...identifiers(declaration)); }
  }
  // Re-exports/default exports need whole-module semantics until resolved.
  if (names && [...names].some(name => !declarations.has(name))) return verificationModuleSlice(source, null);
  return { text: file.body.filter((statement: any) => selected.has(statement) && statement.type !== 'ImportDeclaration').map((statement: any) => source.slice(statement.start, statement.end)).join('\n'), imports };
}

/** Module discovery reads executable tokens, not imports inside generated files,
 * comments or fixture strings. Template interpolations remain executable. */
export function executableModuleInputs(source: string, resolveKnown = true): { imports: string[]; children: string[]; computed: boolean } {
  // Resolve literal URL bases and the original source of an explicitly copied
  // module. The copied destination is temporary; its source bytes are inputs.
  if (resolveKnown) {
  source = source.replace(/\bimport\(`(\.[^`?\n]+)\?test=\$\{Date\.now\(\)\}(?:-\$\{Math\.random\(\)\})?`\)/gu,
    (_whole, module) => `import(${JSON.stringify(module)})`);
  const roots = new Map<string, string>();
  for (const match of source.matchAll(/\bconst\s+(\w+)\s*=\s*(?:fileURLToPath\()?new URL\(\s*(['"])([^'"\n]+)\2\s*,\s*import\.meta\.url\s*\)/gu)) roots.set(match[1]!, match[3]!);
  source = source.replace(/\bimport\(new URL\(\s*(['"])([^'"\n]+)\1\s*,\s*(\w+)\s*\)\.href\)/gu, (whole, _quote, relative, base) => {
    const root = roots.get(base);
    return root?.endsWith('/') ? `import(new URL(${JSON.stringify(root + relative)}, import.meta.url).href)` : whole;
  });
  for (const match of source.matchAll(/\b(?:fs\.)?copyFileSync\(path\.resolve\(import\.meta\.dirname,\s*(['"])([^'"\n]+)\1\),\s*(\w+)\s*\)/gu)) {
    const destination = match[3]!, original = match[2]!;
    const expression = new RegExp(`import\\(\\(await import\\(['"]node:url['"]\\)\\)\\.pathToFileURL\\(${destination}\\)\\.href\\)`, 'gu');
    source = source.replace(expression, `import(new URL(${JSON.stringify(original)}, import.meta.url).href)`);
  }
  // A copied Skill directory is already part of the complete shipped-resource
  // input. Resolve a fixture's returned directory only when the literal source,
  // copy and returned property all occur in the same fixture implementation.
  for (const [variable, original] of roots) {
    if (!original.endsWith('/')) continue;
    const copied = new RegExp(`fs\\.cpSync\\(${variable},\\s*(\\w+),\\s*\\{\\s*recursive:\\s*true\\s*\\}\\)`,'gu');
    for (const match of source.matchAll(copied)) {
      const property = match[1]!;
      if (!new RegExp(`return \\{[^}]*\\b${property}\\b`, 'u').test(source)) continue;
      const expression = new RegExp(`import\\(pathToFileURL\\(path\\.join\\(\\w+\\.${property},\\s*(['"])([^'"\\n]+)\\1\\)\\)\\.href\\)`, 'gu');
      source = source.replace(expression, (_whole, _quote, relative) => `import(new URL(${JSON.stringify(original + relative)}, import.meta.url).href)`);
    }
  }
  }
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
