/** SDK-independent source proof, shared with the complete candidate verifier. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedBuildRoot } from './prepare-source-sdk.ts';
import { collectPluginSourceVerificationBundle, verifyPluginSourcePhase } from './verify-all.ts';

export async function verifySource(args = process.argv.slice(2)) {
  if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--'))) {
    throw new Error('Usage: verify-source.ts [--output <source-bundle.json>]');
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const diagnosticsDirectory = mkdtempSync(join(ownedBuildRoot(root), 'dsh-source-'));
  const { phase } = await verifyPluginSourcePhase('unit', { diagnosticsDirectory });
  const bundle = await collectPluginSourceVerificationBundle();
  if (bundle.records.length !== 1) throw new Error('Portable plugin source proof is missing or invalidated.');
  const output = args[1] ? resolve(args[1]) : null;
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`); }
  const summary = { status: 'passed', step: phase.id, disposition: phase.disposition, durationMs: phase.durationMs, output, diagnosticsDirectory };
  console.log(JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await verifySource(); } catch (error) { console.error(error); process.exitCode = 1; }
}
