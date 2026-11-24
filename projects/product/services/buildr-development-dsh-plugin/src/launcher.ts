import { released } from './channel.ts';
import { supportsDevelopment } from './installation.ts';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { handoff, type Handoff } from './handoff.ts';

export function endpointIdFor(origin: string, dataRoot: string, identity: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ origin, dataRoot, identity }))
    .digest('hex')
    .slice(0, 24);
}

interface InstanceRecord {
  schemaVersion?: unknown;
  url?: unknown;
  secret?: unknown;
  pid?: unknown;
}

interface HealthResponse {
  schemaVersion?: unknown;
  status?: unknown;
  pid?: unknown;
  webProfile?: {
    profile?: unknown;
    dataRoot?: unknown;
  } | null;
  productIdentity?: {
    package?: unknown;
    channel?: unknown;
    sourceRoot?: unknown;
    installationIdentity?: unknown;
  } | null;
}

function sameRealPath(left: unknown, right: string): boolean {
  if (typeof left !== 'string' || !path.isAbsolute(left)) return false;
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return false;
  }
}

export async function probeHealthyInstance(
  dataRoot: string,
  packageRoot: string,
  isReleased: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<Handoff | null> {
  const instanceFile = path.join(dataRoot, 'instance.json');
  if (!fs.existsSync(instanceFile)) return null;
  let instance: InstanceRecord;
  try {
    instance = JSON.parse(fs.readFileSync(instanceFile, 'utf8')) as InstanceRecord;
  } catch {
    return null;
  }
  if (!['buildr.local-app-instance/v2', 'buildr.local-app-instance/v1'].includes(String(instance.schemaVersion))
      || typeof instance.url !== 'string'
      || typeof instance.secret !== 'string'
      || !instance.secret
      || !Number.isInteger(instance.pid)
      || (instance.pid as number) <= 0) {
    return null;
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(instance.url);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== 'http:' || parsedUrl.hostname !== '127.0.0.1' || !parsedUrl.port
      || parsedUrl.username || parsedUrl.password || parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
    return null;
  }
  const origin = parsedUrl.origin;
  try {
    const response = await fetchImpl(`${origin}/api/v1/health`, {
      headers: { 'x-buildr-instance': instance.secret },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const body = await response.json() as HealthResponse;
    if (body.schemaVersion !== 'buildr.local-app-health/v1' || body.status !== 'ready' || body.pid !== instance.pid) {
      return null;
    }
    if (!sameRealPath(body.webProfile?.dataRoot, dataRoot)) return null;
    if (isReleased) {
      if ((body.webProfile?.profile !== 'released' && body.productIdentity?.channel !== 'npm')
          || body.productIdentity?.package !== '@buildr-ai/buildr') {
        return null;
      }
    } else if (body.webProfile?.profile !== 'development' || !sameRealPath(body.productIdentity?.sourceRoot, packageRoot)) {
      return null;
    }
    const realDataRoot = fs.realpathSync(dataRoot);
    const identity = typeof body.productIdentity?.installationIdentity === 'string' && body.productIdentity.installationIdentity
      ? body.productIdentity.installationIdentity
      : String(instance.pid);
    return handoff({
      origin,
      endpointId: endpointIdFor(origin, realDataRoot, identity),
      url: `${origin}/`,
    });
  } catch {
    return null;
  }
}

export interface OpenDevelopmentDependencies {
  probe?: typeof probeHealthyInstance;
  spawnProcess?: typeof spawn;
  timeoutMs?: number;
  pollIntervalMs?: number;
  isReleased?: boolean;
}

export async function openDevelopment(
  input: { node: string; packageRoot: string; dataRoot: string; port: number },
  deps: OpenDevelopmentDependencies = {},
): Promise<Handoff> {
  const isReleased = deps.isReleased ?? released;
  const probe = deps.probe ?? probeHealthyInstance;
  const existing = await probe(input.dataRoot, input.packageRoot, isReleased);
  if (existing) return existing;

  const entry = path.join(input.packageRoot, 'bin', 'buildr.mjs');
  const args = [entry, 'web', '--no-open', '--port', String(input.port), ...(!isReleased ? ['--replace-mismatched-development'] : [])];
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  delete env.BUILDR_LAUNCHER_IDENTITY;
  env.BUILDR_APP_DATA_DIR = input.dataRoot;
  env.PATH = `${path.dirname(input.node)}${path.delimiter}${env.PATH || '/usr/bin:/bin'}`;

  let exited: number | null = null;
  const child = (deps.spawnProcess ?? spawn)(input.node, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  });
  child.once('exit', code => { exited = code ?? 0; });
  child.unref();

  const deadline = Date.now() + (deps.timeoutMs ?? 35_000);
  const pollMs = deps.pollIntervalMs ?? 150;
  while (Date.now() < deadline) {
    const ready = await probe(input.dataRoot, input.packageRoot, isReleased);
    if (ready) return ready;
    if (exited !== null) {
      if (exited !== 0) throw Error(`development-launch-exit-${exited}`);
      const postExit = await probe(input.dataRoot, input.packageRoot, isReleased);
      if (postExit) return postExit;
      throw Error('development-not-ready');
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  throw Error('development-launch-timeout');
}

async function main() {
  const [packageRoot, dataRoot, portText = '4458'] = process.argv.slice(2);
  if (!packageRoot || !dataRoot || !path.isAbsolute(packageRoot) || !path.isAbsolute(dataRoot)) {
    throw Error('binding-missing');
  }
  const root = fs.realpathSync(packageRoot);
  const entry = path.join(root, 'bin', 'buildr.mjs');
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    name?: unknown;
    version?: unknown;
    private?: unknown;
  };
  if (metadata.name !== '@buildr-ai/buildr'
      || (released && (metadata.private === true || !supportsDevelopment(metadata.version)))
      || fs.realpathSync(entry) !== entry) {
    throw Error('development-package-mismatch');
  }
  const port = Number(portText);
  if (!/^[0-9]+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw Error('invalid-port');
  }
  const result = await openDevelopment({ node: process.execPath, packageRoot: root, dataRoot, port });
  process.stdout.write(JSON.stringify(result));
}

if (import.meta.main) main().catch(() => { process.exitCode = 1; });
