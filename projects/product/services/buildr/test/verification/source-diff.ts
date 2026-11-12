import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseVerificationModule } from './verification-input-discovery.ts';

export type SourceChangeEvidence = {
  path: string;
  kind: 'byte-identical' | 'additive-exports' | 'verification-metadata';
  beforeDigest: string;
  afterDigest: string;
};
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
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
    if (/^(?:services\/[^/]+\/)?tools\/testing\/verification-checks\.ts$/u.test(file)
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
