import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { completeSqlPrefix } from '../sql-statement-analysis';

type Token = { name: string; from: number; to: number; text: string };
export type SqlCompletionContext = { kind: 'shortcut' | 'relation'; from: number; to: number; query: string; database?: string; terminated: boolean };
const identifier = (token: Token) => token.name === 'Identifier' || token.name === 'QuotedIdentifier';
export const unquoteIdentifier = (text: string) => text.startsWith('`') ? text.slice(1, text.endsWith('`') && text.length > 1 ? -1 : undefined).replaceAll('``', '`') : text;
export const quoteIdentifier = (text: string) => '`' + text.replaceAll('`', '``') + '`';

/** The SQL parser supplies lexical and nested-statement boundaries; only relation positions are offered. */
export function sqlCompletionContext(state: EditorState, pos = state.selection.main.head): SqlCompletionContext | null {
  if (!state.selection.main.empty) return null;
  const tree = ensureSyntaxTree(state, Math.min(state.doc.length, pos + 1), 40);
  if (!tree) return null;
  let node = tree.resolveInner(pos, -1);
  for (let current = node; current; current = current.parent!) {
    if (/^(?:String|LineComment|BlockComment)$/.test(current.name) && pos > current.from && pos <= current.to) {
      const closed = current.name === 'BlockComment' && state.sliceDoc(current.to - 2, current.to) === '*/';
      if (!(closed && pos === current.to)) return null;
    }
  }
  while (node.parent && node.name !== 'Statement' && node.name !== 'Parens') node = node.parent;
  if (node.name === 'Script') {
    for (let statement = node.firstChild; statement && statement.from <= pos; statement = statement.nextSibling) {
      if (statement.name === 'Statement' && statement.to <= pos && !state.sliceDoc(statement.to, pos).trim()) node = statement;
    }
  }
  // At a boundary the preceding statement can own the cursor. A semicolon starts a fresh statement.
  const tokens: Token[] = [];
  const append = (name: string, from: number, to: number) => {
    if (name === '⚠' || from === to) return;
    const previous = tokens.at(-1);
    // The dialect lexer splits doubled backticks into adjacent quoted nodes. Rejoin the identifier.
    if (name === 'QuotedIdentifier' && previous?.name === name && previous.to === from) {
      previous.to = to; previous.text = state.sliceDoc(previous.from, to);
    } else tokens.push({ name, from, to, text: state.sliceDoc(from, to) });
  };
  const add = (child: typeof node) => {
    if (child.name === 'CompositeIdentifier') {
      for (let part = child.firstChild; part; part = part.nextSibling) append(part.name, part.from, part.to);
    } else if (!/Comment$/.test(child.name)) append(child.name, child.from, child.to);
  };
  for (let child = node.firstChild; child; child = child.nextSibling) add(child);
  const token = tokens.find(item => identifier(item) && item.from <= pos && pos <= item.to);
  const from = token?.from ?? pos, to = token?.to ?? pos;
  const before = tokens.filter(item => item.to <= from);
  const query = token ? unquoteIdentifier(state.sliceDoc(from, pos)) : '';
  const next = tokens.find(item => item.from >= to);
  const base = { from, to, query, terminated: next?.name === ';' };
  const previous = before.at(-1);
  if (node.name === 'Statement' && !before.length && token?.name === 'Identifier' && pos === to) return { ...base, kind: 'shortcut' };
  // An isolated word after a blank line expresses a new edit operation. Validate the prefix,
  // rather than requiring the unfinished word to parse or treating a SELECT alias as a boundary.
  if (token?.name === 'Identifier' && pos === to) {
    const line = state.doc.lineAt(from);
    if (line.number > 1 && !state.doc.line(line.number - 1).text.trim()
      && /^[\t ]*$/u.test(state.sliceDoc(line.from, from))
      && /^[\t ]*;?[\t ]*$/u.test(state.sliceDoc(to, line.to))
      && completeSqlPrefix(state.doc.toString(), from)) return { ...base, kind: 'shortcut' };
  }
  if (!before.some(item => item.name === 'Keyword' && item.text.toUpperCase() === 'SELECT')) return null;
  const relationStart = (items: Token[]) => {
    const last = items.at(-1);
    if (last?.name === 'Keyword' && /^(FROM|JOIN)$/i.test(last.text)) return true;
    if (last?.text !== ',') return false;
    const clause = [...items].reverse().find(item => item.name === 'Keyword' && /^(SELECT|FROM|JOIN|ON|WHERE|GROUP|ORDER|HAVING|LIMIT|UNION)$/i.test(item.text));
    return clause && /^(FROM|JOIN)$/i.test(clause.text);
  };
  if (relationStart(before)) return { ...base, kind: 'relation' };
  const database = before.at(-2);
  if (previous?.text === '.' && database && identifier(database) && relationStart(before.slice(0, -2))) return { ...base, kind: 'relation', database: unquoteIdentifier(database.text) };
  return null;
}
