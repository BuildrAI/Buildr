import mysql from 'node-sql-parser/build/mysql.js';

export type SqlStatement = { from: number; to: number; hasCode: boolean; complete: boolean; uncertain?: boolean };
type Token = { from: number; to: number; depth: number; text: string; kind: 'word' | 'quote' | 'symbol' };
type Chunk = SqlStatement & { tokens: Token[]; delimited: boolean };
const parser = new mysql.Parser();

/** The lexer owns explicit delimiters and excludes quoted/commented keywords from inference. */
function chunks(sql: string): Chunk[] {
  const result: Chunk[] = [];
  let from = 0, tokens: Token[] = [], depth = 0, balanced = true, complete = true;
  const finish = (to: number, delimited: boolean) => {
    result.push({ from, to, hasCode: !!tokens.length, complete: complete && balanced && depth === 0, tokens, delimited });
    from = to; tokens = []; depth = 0; balanced = true; complete = true;
  };
  for (let index = 0; index < sql.length;) {
    const start = index, char = sql[index], next = sql[index + 1];
    if (/\s/u.test(char)) { index++; continue; }
    if (char === '#' || char === '-' && next === '-' && (sql[index + 2] === undefined || /\s/u.test(sql[index + 2]))) {
      while (index < sql.length && sql[index] !== '\n' && sql[index] !== '\r') index++;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2);
      if (end < 0) { complete = false; index = sql.length; } else index = end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      let closed = false; index++;
      while (index < sql.length) {
        if (sql[index] === '\\' && char !== '`') { index += 2; continue; }
        if (sql[index++] !== char) continue;
        if (sql[index] === char) { index++; continue; }
        closed = true; break;
      }
      index = Math.min(index, sql.length); complete &&= closed;
      tokens.push({ from: start, to: index, depth, text: sql.slice(start, index), kind: 'quote' }); continue;
    }
    if (char === ';' && depth === 0) { index++; finish(index, true); continue; }
    if (/[A-Za-z_]/u.test(char)) {
      while (++index < sql.length && /[A-Za-z0-9_$]/u.test(sql[index])) {}
      tokens.push({ from: start, to: index, depth, text: sql.slice(start, index).toUpperCase(), kind: 'word' }); continue;
    }
    if (char === ')') { depth--; if (depth < 0) { balanced = false; depth = 0; } }
    tokens.push({ from: start, to: ++index, depth, text: char, kind: 'symbol' });
    if (char === '(') depth++;
  }
  finish(sql.length, false); return result;
}

function single(sql: string): boolean {
  // This only checks complete syntax. Always retain original SQL and leave permissions to the server.
  if (sql.length > 64 * 1024) return false;
  try { const ast = parser.astify(sql, { database: 'MySQL' }); return !!ast && (!Array.isArray(ast) || ast.length === 1); }
  catch { return false; }
}

function startCandidate(tokens: Token[], index: number): boolean {
  const token = tokens[index];
  if (token.depth || token.kind !== 'word') return false;
  if (token.text === 'SELECT') {
    const previous = tokens[index - 1]?.text, before = tokens[index - 2]?.text;
    return !['UNION', 'INTERSECT', 'EXCEPT'].includes(previous) && !(['ALL', 'DISTINCT'].includes(previous) && ['UNION', 'INTERSECT', 'EXCEPT'].includes(before));
  }
  if (token.text !== 'WITH') return false;
  // WITH ROLLUP is a continuation. Only a plausible CTE header can begin another statement.
  let next = index + 1;
  if (tokens[next]?.text === 'RECURSIVE') next++;
  if (!tokens[next] || !['word', 'quote'].includes(tokens[next].kind)) return false;
  next++;
  if (tokens[next]?.text === '(') {
    next++;
    while (tokens[next] && !(tokens[next].text === ')' && tokens[next].depth === 0)) next++;
    next++;
  }
  return tokens[next]?.text === 'AS' && tokens[next + 1]?.text === '(';
}

function infer(sql: string, chunk: Chunk): SqlStatement[] {
  if (!chunk.hasCode) return [chunk];
  const result: SqlStatement[] = [];
  let from = chunk.from, attempts = 0;
  const candidates = chunk.tokens.map((token, index) => ({ token, index })).filter(({ index }) => index > 0 && startCandidate(chunk.tokens, index));
  // A valid whole query wins over all possible keyword boundaries (CTEs, UNION, subqueries).
  if (chunk.complete && single(sql.slice(from, chunk.to))) return [chunk];
  for (const { token, index } of candidates) {
    if (token.from <= from) continue;
    if (++attempts > 64) return [...result, { from, to: chunk.to, hasCode: true, complete: chunk.complete, uncertain: true }];
    const boundary = chunk.tokens[index - 1].to;
    if (!single(sql.slice(from, boundary))) continue;
    result.push({ from, to: boundary, hasCode: true, complete: true });
    from = boundary; attempts = 0;
    if (chunk.complete && single(sql.slice(from, chunk.to))) return [...result, { from, to: chunk.to, hasCode: true, complete: true }];
  }
  // Explicit, unambiguous delimiters still locate unsupported/in-progress SQL for server validation.
  // Otherwise do not guess a range spanning an incomplete or unknown query.
  result.push({ from, to: chunk.to, hasCode: true, complete: chunk.complete, uncertain: !chunk.delimited || candidates.some(({ token }) => token.from > from) });
  return result;
}

let cached: { document: string; statements: readonly SqlStatement[] } | undefined;
let prefixCache: { text: string; complete: boolean } | undefined;
/** Editing can start a new operation after complete queries, without teaching analysis about triggers. */
export function completeSqlPrefix(document: string, end: number): boolean {
  const text = document.slice(0, end);
  if (prefixCache?.text === text) return prefixCache.complete;
  const pieces = chunks(text).flatMap(chunk => infer(text, chunk));
  const code = pieces.filter(piece => piece.hasCode);
  const complete = code.length > 0 && pieces.every(piece => piece.complete && !piece.uncertain);
  prefixCache = { text, complete };
  return complete;
}
/** One derived document cache, shared by painting and execution; caret moves never reparse. */
export function sqlStatements(document: string): readonly SqlStatement[] {
  if (cached?.document === document) return cached.statements;
  const statements = chunks(document).flatMap(chunk => infer(document, chunk));
  cached = { document, statements }; return statements;
}
