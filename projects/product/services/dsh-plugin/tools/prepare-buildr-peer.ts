import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { prepareBuildrPeer } from './buildr-peer.ts';
const args = process.argv.slice(2), values = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (!['--artifact-manifest', '--output', '--node', '--npm'].includes(args[i]) || values.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: prepare-buildr-peer.ts --artifact-manifest <input> --output <receipt> [--node <node>] [--npm <npm-js>]');
  values.set(args[i], args[i + 1]);
}
if (!values.has('--artifact-manifest') || !values.has('--output')) throw new Error('Explicit artifact input and output are required');
const peer = prepareBuildrPeer({ artifactManifest: path.resolve(values.get('--artifact-manifest')!), nodeExecutable: values.get('--node'), npmCli: values.get('--npm') });
const output = path.resolve(values.get('--output')!);
writeFileSync(output, `${JSON.stringify(peer, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ status: 'prepared', manifestPath: output })}\n`);
