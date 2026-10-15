import { codeGit, type CodeSource } from './code-file-reader.ts';

/** Use only explicit Git configuration for this checkout, never OS or environment guesses. */
export function readCodeConfiguredAuthor(source: CodeSource): { name: string; email: string } | null {
  const records = codeGit(source.location, ['config', '--null', '--list'], 1024 * 1024).toString().split('\0');
  const values = new Map<string, string>();
  for (const record of records) {
    const separator = record.indexOf('\n');
    if (separator < 0) continue;
    const key = record.slice(0, separator).toLowerCase();
    if (['author.name', 'author.email', 'user.name', 'user.email'].includes(key)) values.set(key, record.slice(separator + 1));
  }
  const email = values.get('author.email')?.trim() || values.get('user.email')?.trim() || '';
  if (!email || email.length > 320 || /[\0\r\n<>]/.test(email)) return null;
  const name = values.get('author.name')?.trim() || values.get('user.name')?.trim() || '';
  return { name: /[\0\r\n<>]/.test(name) ? '' : name, email };
}
