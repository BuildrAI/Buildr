export type SqlSelection = { from: number; to: number };
export type SqlExecutionTarget = { sql: string; mode: 'selection' | 'cursor' };
type Statement = { from: number; to: number; hasCode: boolean; complete: boolean };

/** Locate statements only. The server remains responsible for SQL syntax and read-only validation. */
function statements(sql: string): Statement[] {
  const result: Statement[] = [];
  let from = 0, hasCode = false, quote = '', blockComment = false, lineComment = false;
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index], next = sql[index + 1];
    if (lineComment) { if (char === '\n' || char === '\r') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index++; } continue; }
    if (quote) {
      if (char === '\\' && quote !== '`') { index++; continue; }
      if (char === quote) { if (next === quote) index++; else quote = ''; }
      continue;
    }
    if (char === '#') { lineComment = true; continue; }
    if (char === '-' && next === '-' && (sql[index + 2] === undefined || /\s/u.test(sql[index + 2]))) { lineComment = true; index++; continue; }
    if (char === '/' && next === '*') { blockComment = true; index++; continue; }
    if (char === ';') { result.push({ from, to: index + 1, hasCode, complete: true }); from = index + 1; hasCode = false; continue; }
    if (char === "'" || char === '"' || char === '`') quote = char;
    if (!/\s/u.test(char)) hasCode = true;
  }
  result.push({ from, to: sql.length, hasCode, complete: !quote && !blockComment });
  return result;
}

export function sqlExecutionTarget(sql: string, selection: SqlSelection): SqlExecutionTarget {
  const { from, to } = selection;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > sql.length) throw new Error('查询位置已变化，请重新选择语句。');
  if (from !== to) {
    const selected = sql.slice(from, to), pieces = statements(selected);
    if (pieces.some(piece => !piece.complete)) throw new Error('选中的语句不完整，请检查引号或注释。');
    const executable = pieces.filter(piece => piece.hasCode);
    if (executable.length > 1) throw new Error('一次只能执行一条语句，请只选择一条。');
    if (!executable.length) throw new Error('请选中一条查询语句，空白或注释不能执行。');
    // Preserve the exact selection; never repair or expand an incomplete user selection.
    return { sql: selected, mode: 'selection' };
  }
  const pieces = statements(sql);
  let piece = pieces.find(item => from >= item.from && from < item.to) ?? (from === sql.length ? pieces.at(-1) : undefined);
  if (piece && !piece.hasCode && !sql.slice(piece.from, piece.to).trim() && piece === pieces.at(-1)) piece = pieces.at(-2);
  if (!piece?.hasCode) throw new Error('光标处没有查询语句，请移动光标或选中一条语句。');
  if (!piece.complete) throw new Error('当前语句不完整，请检查引号或注释。');
  return { sql: sql.slice(piece.from, piece.to).trim(), mode: 'cursor' };
}
