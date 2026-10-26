import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseVerificationInputs } from './verify-all.ts';
import { preparePluginCheckEnvironment } from './check-environment.ts';

const root = path.resolve(import.meta.dirname, '..');
const request = parseVerificationInputs(process.argv.slice(2));
const startedAt = Date.now();
const prepared = preparePluginCheckEnvironment(root, request);
// Only declared public input locations are exported; no inherited credentials or runtime state.
const names = ['BUILDR_DSH_SDK_ROOT', 'BUILDR_DSH_SOURCE_SDK_ROOT', 'BUILDR_DSH_BUNDLE_ROOT', 'BUILDR_DSH_SOURCE_UI_SDK_ROOT',
  'BUILDR_DSH_SOURCE_UI_CONSUMER_ROOT', 'BUILDR_DSH_BUILDR_PEER_MANIFEST', 'BUILDR_DSH_COMPOSITION_ROOT', 'BUILDR_DSH_COMPOSITION_DEV_ROOT'] as const;
const receipt = {
  schemaVersion: 'buildr.plugin-check-environment/v1',
  status: 'prepared', root: prepared.bundles, durationMs: Date.now() - startedAt,
  env: Object.fromEntries(names.map(name => [name, prepared.environment[name]])),
  testsExecuted: false, desktopActivated: false,
};
if (request.output) writeFileSync(request.output, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt)}\n`);
