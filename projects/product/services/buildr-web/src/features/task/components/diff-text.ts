export type DiffRow = { oldNo: number | null; newNo: number | null; kind: 'ctx' | 'add' | 'del' | 'meta' | 'hunk'; text: string };

export function parseUnifiedDiff(text: string): { rows: DiffRow[]; totalAdd: number; totalDel: number } {
  const rows: DiffRow[] = [];
  let oldNo = 0, newNo = 0, adds = 0, dels = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (match) { oldNo = Number(match[1]); newNo = Number(match[3]); }
      rows.push({ oldNo: null, newNo: null, kind: 'hunk', text: line });
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) { rows.push({ oldNo: null, newNo: null, kind: 'meta', text: line }); continue; }
    if (line.startsWith('+')) { rows.push({ oldNo: null, newNo: newNo++, kind: 'add', text: line.slice(1) }); adds += 1; continue; }
    if (line.startsWith('-')) { rows.push({ oldNo: oldNo++, newNo: null, kind: 'del', text: line.slice(1) }); dels += 1; continue; }
    rows.push({ oldNo: oldNo++, newNo: newNo++, kind: 'ctx', text: line.startsWith(' ') ? line.slice(1) : line });
  }
  return { rows, totalAdd: adds, totalDel: dels };
}

export function pairForSplit(rows: DiffRow[]): { left: DiffRow | null; right: DiffRow | null }[] {
  const pairs: { left: DiffRow | null; right: DiffRow | null }[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.kind === 'add') { pairs.push({ left: null, right: row }); continue; }
    if (row.kind !== 'del') { pairs.push({ left: row, right: row.kind === 'ctx' ? row : null }); continue; }
    const dels: DiffRow[] = [];
    while (index < rows.length && rows[index].kind === 'del') { dels.push(rows[index]); index += 1; }
    const adds: DiffRow[] = [];
    while (index < rows.length && rows[index].kind === 'add') { adds.push(rows[index]); index += 1; }
    index -= 1;
    const length = Math.max(dels.length, adds.length);
    for (let i = 0; i < length; i += 1) pairs.push({ left: dels[i] ?? null, right: adds[i] ?? null });
  }
  return pairs;
}
