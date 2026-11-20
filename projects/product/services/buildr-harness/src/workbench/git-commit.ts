export type GitCommit = {
  hash: string; shortHash: string; subject: string; message: string;
  authorName: string; authorEmail: string; authoredAt: string; committedAt: string;
};

export function parseGitCommitObject(hash: string, content: Buffer): GitCommit {
  const boundary = content.indexOf('\n\n');
  if (boundary < 0 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(hash)) throw new Error('Invalid Git commit object.');
  const headers = content.subarray(0, boundary).toString('utf8').split('\n');
  const encoding = headers.find(line => line.startsWith('encoding '))?.slice(9) || 'utf-8';
  const decoder = new TextDecoder(encoding, { fatal: true });
  const author = decoder.decode(content.subarray(0, boundary)).split('\n').find(line => line.startsWith('author '));
  const committer = headers.find(line => line.startsWith('committer '));
  const authorMatch = /^author (.*) <([^<>]*)> (-?\d+) [+-]\d{4}$/.exec(author || '');
  const committerMatch = /^committer .* <[^<>]*> (-?\d+) [+-]\d{4}$/.exec(committer || '');
  if (!authorMatch || !committerMatch) throw new Error('Invalid Git commit identity.');
  const message = decoder.decode(content.subarray(boundary + 2));
  if (message.includes('\0')) throw new Error('Invalid Git commit message.');
  return {
    hash, shortHash: hash.slice(0, 12), subject: message.split(/\r?\n[ \t]*\r?\n/)[0].split(/\r?\n/).map(line => line.trim()).join(' '), message,
    authorName: authorMatch[1], authorEmail: authorMatch[2],
    authoredAt: new Date(Number(authorMatch[3]) * 1000).toISOString(),
    committedAt: new Date(Number(committerMatch[1]) * 1000).toISOString(),
  };
}
