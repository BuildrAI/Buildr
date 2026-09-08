import fs from 'node:fs';
import path from 'node:path';

function isRegularFile(file: string, io: Pick<typeof fs, 'statSync' | 'lstatSync'>) {
  try {
    return io.statSync(file, { throwIfNoEntry: false })?.isFile() === true
      && io.lstatSync(file).isSymbolicLink() === false;
  } catch {
    return false;
  }
}

export function parseChangeChecklistText(content: string) {
  const matches = [...content.matchAll(/^\s*-\s*\[([ xX])\]\s+/gm)];
  const completed = matches.filter((match) => match[1].toLowerCase() === 'x').length;
  return { completed, total: matches.length, remaining: matches.length - completed };
}

export function inspectChangeChecklist(changeRoot: string, { io = fs }: { io?: Pick<typeof fs, 'statSync' | 'lstatSync' | 'readFileSync'> } = {}) {
  const file = path.join(changeRoot, 'tasks.md');
  if (!isRegularFile(file, io)) return { exists: false, completed: null, total: null, remaining: null };
  return { exists: true, ...parseChangeChecklistText(io.readFileSync(file, 'utf8')) };
}
