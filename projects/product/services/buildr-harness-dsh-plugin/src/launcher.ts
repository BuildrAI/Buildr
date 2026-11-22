/** Executed by the explicitly selected Node, not inside DSH's Electron Host. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { handoff } from './handoff.ts';

interface WebStatus { ready: boolean; origin?: string; endpointId?: string }
interface HarnessClient {
  web: {
    status(): Promise<WebStatus>;
    enable(input?: { port: number }): Promise<WebStatus>;
    login(): Promise<{ url: string; endpointId: string; expiresAt: number }>;
  };
  disconnect(): Promise<void>;
}

export async function openHarness(client: HarnessClient, initialPort: number) {
  try {
    let status = await client.web.status();
    if (!status.ready) status = await client.web.enable(status.origin ? undefined : { port: initialPort });
    if (!status.ready || !status.origin || !status.endpointId) throw Error('harness-not-ready');
    const login = await client.web.login();
    if (login.endpointId !== status.endpointId) throw Error('harness-endpoint-changed');
    return handoff({ ...login, origin: status.origin });
  } finally { await client.disconnect(); }
}

async function main() {
  const [packageRoot, dataRoot, portText = '9519'] = process.argv.slice(2);
  if (!packageRoot || !dataRoot || !path.isAbsolute(packageRoot) || !path.isAbsolute(dataRoot)) throw Error('binding-missing');
  const root = fs.realpathSync(packageRoot);
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const index = path.join(root, 'build/index.js');
  if (metadata.name !== '@buildr-ai/buildr-harness' || fs.realpathSync(index) !== index) throw Error('harness-package-mismatch');
  const port = Number(portText);
  if (!/^[0-9]+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) throw Error('invalid-port');
  const { connectHarnessProcess } = await import(pathToFileURL(index).href);
  const client: HarnessClient = await connectHarnessProcess({
    dataRoot, profileId: 'development', sourceId: 'harness-local',
    caller: { kind: 'first-party-user', product: 'buildr-harness' },
  });
  // stdout is a private pipe to the Desktop host, not DSH logs or the command line.
  process.stdout.write(JSON.stringify(await openHarness(client, port)));
}

if (import.meta.main) main().catch(() => { process.exitCode = 1; });
