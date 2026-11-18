import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseVerificationModule } from './verification-input-discovery.ts';

export type SourceChangeEvidence = {
  path: string;
  kind: 'byte-identical' | 'additive-exports' | 'verification-metadata';
  beforeDigest: string;
  afterDigest: string;
};
export type VerificationCheckDiffEvidence = {
  path: string;
  checkIds: string[];
  beforeDigest: string;
  afterDigest: string;
};
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const verificationChecksPattern = /^(?:services\/[^/]+\/)?tools\/testing\/verification-checks\.ts$/u;
const named = (node: any) => node.type === 'ExportNamedDeclaration' && node.source && !node.declaration;
const name = (node: any): string => node.name ?? node.value;
const member = (node: any) => `${name(node.local)}:${name(node.exported)}`;

/** Only source ownership data is exempt. Commands, membership, preparation,
 * budgets and unknown computations remain exact execution recipe changes. */
function selectionMetadataOnly(old: any, current: any): boolean {
  const fields = new Set(['sourcePaths', 'inputExclusions', 'behaviorOnlyInputs']);
  const groupId = (node: any) => node?.type === 'MemberExpression' && !node.computed
    && node.object.type === 'Identifier' && node.object.name === 'group' && node.property.name === 'id';
  const data = (node: any): boolean => {
    if (!node) return false;
    if (node.type === 'Literal') return ['string', 'number', 'boolean'].includes(typeof node.value) || node.value === null;
    if (node.type === 'ArrayExpression') return node.elements.every(data);
    if (node.type === 'SpreadElement') return data(node.argument);
    if (node.type === 'ConditionalExpression') return data(node.test) && data(node.consequent) && data(node.alternate);
    if (['BinaryExpression', 'LogicalExpression'].includes(node.type)) return ['===', '||', '&&'].includes(node.operator) && data(node.left) && data(node.right);
    if (groupId(node)) return true;
    if (node.type !== 'CallExpression' || node.optional || node.callee.type !== 'MemberExpression' || node.callee.computed) return false;
    const method = node.callee.property.name, object = node.callee.object;
    return (method === 'includes' && object.type === 'ArrayExpression' && data(object)
      || method === 'startsWith' && groupId(object)) && node.arguments.every(data);
  };
  const canonical = (value: any): any => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.filter(item => {
      if (item?.type !== 'Property' || item.computed || !fields.has(name(item.key))) return true;
      if (item.kind !== 'init' || item.method || item.shorthand || !data(item.value)) throw new Error('Opaque selection metadata');
      return false;
    }).map(canonical);
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key))
      .map(([key, child]) => [key, canonical(child)]));
  };
  return JSON.stringify(canonical(old)) === JSON.stringify(canonical(current));
}

/** A bounded proof, not a general refactor/equivalence classifier. Parsing
 * never executes source. Unknown syntax/loading keeps the original owners. */
export function sourceChangeEvidence(
  file: string, before: string, after: string,
  readModule?: (specifier: string, version: 'before' | 'after') => string,
): SourceChangeEvidence | null {
  const proof = (kind: SourceChangeEvidence['kind']): SourceChangeEvidence =>
    ({ path: file, kind, beforeDigest: digest(before), afterDigest: digest(after) });
  if (before === after) return proof('byte-identical');
  if (!/\.[cm]?ts$/u.test(file)) return null;
  try {
    const old = parseVerificationModule(before), current = parseVerificationModule(after);
    if (verificationChecksPattern.test(file)
      && selectionMetadataOnly(old, current)) return proof('verification-metadata');
    // Keep original statement bytes, including ASI-sensitive newlines and type
    // declarations erased by Node. Only named export lists may differ.
    const rest = (ast: any, text: string) => {
      const statements: string[] = [], gaps: string[] = [];
      let end = 0;
      for (const node of ast.body) {
        const gap = text.slice(end, node.start).trim();
        if (gap) gaps.push(gap);
        if (!named(node)) statements.push(text.slice(node.start, node.end));
        else if (node.attributes?.length || /\btype\b/u.test(text.slice(node.start, node.end))) {
          throw new Error('Opaque export syntax');
        }
        end = node.end;
      }
      const tail = text.slice(end).trim();
      if (tail) gaps.push(tail);
      return JSON.stringify([statements, gaps]);
    };
    if (rest(old, before) !== rest(current, after)) return null;
    const modules = (ast: any): string[] => [...new Set<string>(ast.body
      .filter((node: any) => node.source && ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type))
      .map((node: any) => node.source.value))];
    if (JSON.stringify(modules(old)) !== JSON.stringify(modules(current))) return null;
    const exportMap = (ast: any) => {
      const result = new Map<string, Set<string>>();
      for (const node of ast.body.filter(named)) {
        if (!result.has(node.source.value)) result.set(node.source.value, new Set());
        for (const item of node.specifiers) result.get(node.source.value)!.add(member(item));
      }
      return result;
    };
    const previous = exportMap(old), next = exportMap(current);
    for (const [source, members] of previous) {
      if (!next.has(source) || [...members].some(item => !next.get(source)!.has(item))) return null;
    }
    const added = current.body.filter(named).flatMap((node: any) => node.specifiers
      .filter((item: any) => !previous.get(node.source.value)?.has(member(item))));
    if (!added.length) return null;
    const addedNames = added.map((item: any) => name(item.exported));
    if (new Set(addedNames).size !== addedNames.length) return null;
    // Star barrels must not be shadowed. Resolve declaration surfaces only;
    // unknown/cyclic/external barrels stay conservative.
    const publicNames = (ast: any, version: 'before' | 'after', directory = '.', seen = new Set<string>()): string[] => {
      const names: string[] = [];
      for (const node of ast.body) {
        if (node.type === 'ExportDefaultDeclaration') { names.push('default'); continue; }
        if (node.type === 'ExportAllDeclaration') {
          if (node.exported) { names.push(name(node.exported)); continue; }
          if (!readModule || !node.source.value.startsWith('.')) throw new Error('Opaque barrel');
          const relative = path.posix.normalize(path.posix.join(directory, node.source.value));
          if (seen.has(relative)) throw new Error('Cyclic barrel');
          const module = parseVerificationModule(readModule(relative.startsWith('.') ? relative : `./${relative}`, version));
          names.push(...publicNames(module, version, path.posix.dirname(relative), new Set([...seen, relative])));
        }
        if (node.type !== 'ExportNamedDeclaration') continue;
        names.push(...node.specifiers.map((item: any) => name(item.exported)));
        const declaration = node.declaration;
        if (!declaration) continue;
        if (declaration.type === 'VariableDeclaration') {
          for (const item of declaration.declarations) {
            if (item.id.type !== 'Identifier') throw new Error('Opaque binding');
            names.push(item.id.name);
          }
        } else {
          if (!declaration.id?.name) throw new Error('Opaque declaration');
          names.push(declaration.id.name);
        }
      }
      return names;
    };
    if (publicNames(old, 'before').some(value => addedNames.includes(value))) return null;
    const stars = { body: current.body.filter((node: any) => node.type === 'ExportAllDeclaration') };
    if (publicNames(stars, 'after').some(value => addedNames.includes(value))) return null;
    return proof('additive-exports');
  } catch {
    return null;
  }
}

function stripAstLocations(node: any): any {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(stripAstLocations);
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key))
      .map(([key, value]) => [key, stripAstLocations(value)]),
  );
}

function unwrapCheckArrayExpression(node: any): { elements: any[]; transform: any } | null {
  let current = node;
  while (current && ['TSAsExpression', 'TSTypeAssertion', 'TSSatisfiesExpression'].includes(current.type)) {
    current = current.expression;
  }
  if (!current) return null;
  if (current.type === 'ArrayExpression') return { elements: current.elements, transform: null };
  if (current.type === 'CallExpression' && !current.optional && current.callee?.type === 'MemberExpression'
    && !current.callee.computed && current.callee.property?.name === 'map'
    && current.callee.object?.type === 'ArrayExpression') {
    return { elements: current.callee.object.elements, transform: stripAstLocations(current.arguments) };
  }
  return null;
}

function staticCheckElementId(node: any): string | null {
  if (!node || node.type !== 'ObjectExpression') return null;
  for (const property of node.properties ?? []) {
    if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method || property.shorthand) continue;
    const key = property.key?.type === 'Identifier' ? property.key.name : property.key?.type === 'Literal' ? String(property.key.value) : null;
    if (key === 'id' && property.value?.type === 'Literal' && typeof property.value.value === 'string' && property.value.value.length > 0) {
      return property.value.value;
    }
  }
  return null;
}

function collectReferencedIdentifiers(node: any, seen = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return seen;
  if (Array.isArray(node)) {
    for (const item of node) collectReferencedIdentifiers(item, seen);
    return seen;
  }
  if (node.type === 'Identifier' && typeof node.name === 'string') seen.add(node.name);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'raw') continue;
    if (node.type === 'Property' && !node.computed && key === 'key') continue;
    if (node.type === 'MemberExpression' && !node.computed && key === 'property') continue;
    collectReferencedIdentifiers(value, seen);
  }
  return seen;
}

function parseVerificationCheckCatalog(source: string): {
  importsKey: string;
  catalogTransforms: Record<string, string>;
  checks: Map<string, string>;
} | null {
  const ast = parseVerificationModule(source);
  const imports: any[] = [];
  const helpers = new Map<string, { raw: any; canonical: string }>();
  const catalogs: Array<{ name: string; elements: any[]; transform: string }> = [];

  for (const statement of ast.body ?? []) {
    if (statement.type === 'ImportDeclaration') {
      imports.push(stripAstLocations(statement));
      continue;
    }
    const declaration = statement.type === 'ExportNamedDeclaration' && !statement.source ? statement.declaration : statement;
    if (!declaration || declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') return null;
    for (const declarator of declaration.declarations ?? []) {
      if (declarator.id?.type !== 'Identifier' || !declarator.init) return null;
      const name = declarator.id.name;
      const arrayInfo = unwrapCheckArrayExpression(declarator.init);
      const isCatalog = arrayInfo !== null && arrayInfo.elements.some(element => staticCheckElementId(element) !== null);
      if (isCatalog && arrayInfo.elements.every(element => element !== null && (staticCheckElementId(element) !== null
        || element.type === 'SpreadElement' && element.argument?.type === 'Identifier'))) {
        catalogs.push({ name, elements: arrayInfo.elements, transform: JSON.stringify(arrayInfo.transform) });
      } else {
        helpers.set(name, { raw: declarator.init, canonical: JSON.stringify(stripAstLocations(declarator.init)) });
      }
    }
  }

  const helperDepsCache = new Map<string, string[]>();
  const resolveHelperDeps = (name: string, stack = new Set<string>()): string[] => {
    if (helperDepsCache.has(name)) return helperDepsCache.get(name)!;
    if (stack.has(name) || !helpers.has(name)) return [];
    const nextStack = new Set([...stack, name]);
    const collected = new Set<string>();
    for (const ref of collectReferencedIdentifiers(helpers.get(name)!.raw)) {
      if (!helpers.has(ref)) continue;
      collected.add(ref);
      for (const nested of resolveHelperDeps(ref, nextStack)) collected.add(nested);
    }
    const ordered = [...collected].sort();
    helperDepsCache.set(name, ordered);
    return ordered;
  };

  const catalogTransforms: Record<string, string> = {};
  const checks = new Map<string, string>();
  const catalogNames = new Set(catalogs.map(catalog => catalog.name));

  for (const catalog of catalogs) {
    catalogTransforms[catalog.name] = catalog.transform;
    for (const element of catalog.elements) {
      if (element.type === 'SpreadElement') {
        if (!catalogNames.has(element.argument.name)) return null;
        continue;
      }
      const id = staticCheckElementId(element);
      if (!id || checks.has(id)) return null;
      const directRefs = [...collectReferencedIdentifiers(element)].filter(ref => helpers.has(ref));
      const allHelperNames = new Set<string>();
      for (const ref of directRefs) {
        allHelperNames.add(ref);
        for (const nested of resolveHelperDeps(ref)) allHelperNames.add(nested);
      }
      const deps = [...allHelperNames].sort().map(name => [name, helpers.get(name)!.canonical]);
      checks.set(id, JSON.stringify({
        catalog: catalog.name,
        transform: catalog.transform,
        element: stripAstLocations(element),
        deps,
      }));
    }
  }
  return { importsKey: JSON.stringify(imports), catalogTransforms, checks };
}

/** Narrow verification-checks.ts edits that add, remove or modify individual
 * check entries without altering module imports or shared catalog transforms. */
export function changedVerificationCheckEvidence(file: string, before: string, after: string): VerificationCheckDiffEvidence | null {
  if (!verificationChecksPattern.test(file) || !/\.[cm]?ts$/u.test(file)) return null;
  if (before === after) return { path: file, checkIds: [], beforeDigest: digest(before), afterDigest: digest(after) };
  try {
    const oldCatalog = parseVerificationCheckCatalog(before);
    const currentCatalog = parseVerificationCheckCatalog(after);
    if (!oldCatalog || !currentCatalog) return null;
    if (oldCatalog.importsKey !== currentCatalog.importsKey) return null;
    const allTransformNames = [...new Set([...Object.keys(oldCatalog.catalogTransforms), ...Object.keys(currentCatalog.catalogTransforms)])];
    for (const name of allTransformNames) {
      if (oldCatalog.catalogTransforms[name] !== currentCatalog.catalogTransforms[name]) return null;
    }
    const allIds = [...new Set([...oldCatalog.checks.keys(), ...currentCatalog.checks.keys()])].sort();
    const checkIds = allIds.filter(id => oldCatalog.checks.get(id) !== currentCatalog.checks.get(id));
    return { path: file, checkIds, beforeDigest: digest(before), afterDigest: digest(after) };
  } catch {
    return null;
  }
}
