/** Host compatibility is independent of the exact source SDK used to compile a package. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FileDigest, SourceHostArtifacts } from './prepare-source-sdk.ts';

const template = JSON.parse(readFileSync(new URL('../plugin/package.template.json', import.meta.url), 'utf8'));
/** The package template owns the supported DSH host series, including prereleases. */
export const DSH_HOST_VERSION_RANGE: string = template.peerDependencies['@deepseek-ai/dsh'];

/** Every DSH peer is checked against the host version; unrelated peers keep their own constraints. */
export function normalizeDshHostPeers(peers: Readonly<Record<string, string>> = {}): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...peers, '@deepseek-ai/dsh': DSH_HOST_VERSION_RANGE }).map(([name, range]) =>
    [name, name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-') ? DSH_HOST_VERSION_RANGE : range]));
}

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
/** Copy verified SDK bytes into a new content-addressed Host closure without changing the SDK. */
export async function copyDshHostArtifacts(sdk: string, host: SourceHostArtifacts, output: string): Promise<{ directory: string; files: FileDigest[] }> {
  const members = await Promise.all(host.files.map(async file => {
    const prefix = `${host.directory}/`, relative = file.path.slice(prefix.length);
    if (!file.path.startsWith(prefix) || !relative || relative.includes('\\') || relative.split('/').some(part => part === '..' || part === '.')) throw Error('Invalid source Host artifact member');
    let bytes = await readFile(join(sdk, file.path));
    if (sha256(bytes) !== file.sha256) throw Error(`Source Host artifact changed while copying: ${file.path}`);
    if (relative.endsWith('/package.json') || relative === 'package.json') {
      const metadata = JSON.parse(bytes.toString('utf8'));
      metadata.peerDependencies = normalizeDshHostPeers(metadata.peerDependencies);
      bytes = Buffer.from(JSON.stringify(metadata, null, 2) + '\n');
    }
    return { relative, bytes, digest: { path: file.path, sha256: sha256(bytes) } };
  }));
  members.sort((a, b) => a.digest.path.localeCompare(b.digest.path));
  const files = members.map(member => member.digest);
  const directory = `runtime-host-${sha256(JSON.stringify(files)).slice(0, 16)}`;
  await mkdir(join(output, directory));
  for (const member of members) {
    const file = join(output, directory, member.relative);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, member.bytes, { flag: 'wx' });
  }
  return { directory, files };
}
