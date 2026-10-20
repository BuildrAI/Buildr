import { sqlStatements } from './sql-statement-analysis.ts';

export type SqlSelection = { from: number; to: number };
export type SqlExecutionTarget = SqlSelection & { sql: string; mode: 'selection' | 'cursor' };

export function sqlExecutionTarget(sql: string, selection: SqlSelection): SqlExecutionTarget {
  const { from, to } = selection;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > sql.length) throw new Error('查询位置已变化，请重新选择语句。');
  if (from !== to) {
    const selected = sql.slice(from, to), pieces = sqlStatements(selected);
    if (pieces.some(piece => !piece.complete)) throw new Error('选中的语句不完整，请检查引号或注释。');
    const executable = pieces.filter(piece => piece.hasCode);
    if (executable.length > 1) throw new Error('一次只能执行一条语句，请只选择一条。');
    if (!executable.length) throw new Error('请选中一条查询语句，空白或注释不能执行。');
    // Preserve the exact selection; never repair or expand an incomplete user selection.
    return { sql: selected, mode: 'selection', from, to };
  }
  const pieces = sqlStatements(sql);
  let piece = pieces.find(item => from >= item.from && from < item.to) ?? (from === sql.length ? pieces.at(-1) : undefined);
  if (piece) {
    const previous = pieces[pieces.indexOf(piece) - 1];
    const paddingEnd = piece.from + (sql.slice(piece.from, piece.to).match(/^[\t ]*/u)?.[0].length ?? 0);
    // A caret immediately after a delimiter is still at the end of that statement.
    // Keep its same-line trailing spaces too, but give the next SQL's start to that SQL.
    const lineEnd = from === paddingEnd && (from === sql.length || sql[from] === '\n' || sql[from] === '\r');
    if (previous?.hasCode && previous.complete && (from === piece.from || from < paddingEnd || lineEnd)) piece = previous;
  }
  if (piece && !piece.hasCode && !sql.slice(piece.from, piece.to).trim() && piece === pieces.at(-1)) piece = pieces.at(-2);
  if (!piece?.hasCode) throw new Error('光标处没有查询语句，请移动光标或选中一条语句。');
  if (!piece.complete) throw new Error('当前语句不完整，请检查引号或注释。');
  if (piece.uncertain) throw new Error('无法确定当前语句边界，请选中要运行的查询，或补充分号并检查语法。');
  const raw = sql.slice(piece.from, piece.to);
  const start = piece.from + raw.length - raw.trimStart().length;
  const end = piece.to - (raw.length - raw.trimEnd().length);
  return { sql: sql.slice(start, end), mode: 'cursor', from: start, to: end };
}
