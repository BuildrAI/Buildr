/** SDK-independent source proof, shared with the complete candidate verifier. */
import { mkdtempSync } from 'node:fs';
import crypto from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedBuildRoot } from './prepare-source-sdk.ts';
import { verifyPluginSourcePhase } from './verify-all.ts';

export async function verifySource(args = process.argv.slice(2)) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--round', '--output'].includes(args[i]) || !args[i + 1] || values.has(args[i])) throw new Error('Usage: verify-source.ts [--round <round-id>] [--output <round-log.json>]');
    values.set(args[i], args[i + 1]);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const diagnosticsDirectory = mkdtempSync(join(ownedBuildRoot(root), 'dsh-source-'));
  const output = values.has('--output') ? resolve(values.get('--output')!) : null;
  const { phase } = await verifyPluginSourcePhase('unit', { diagnosticsDirectory,
    round: { roundId: values.get('--round') ?? crypto.randomUUID(), ...(output ? { output } : {}) } });
  const summary = { status: 'passed', step: phase.id, disposition: phase.disposition, durationMs: phase.durationMs, output, diagnosticsDirectory };
  console.log(JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await verifySource(); } catch (error) { console.error(error); process.exitCode = 1; }
}
