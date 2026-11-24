import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createAntigravityExecutor } from '../../src/executors/antigravity/index.ts';

export const fixtureSource = fileURLToPath(new URL('../integration/executors/fixtures/antigravity-acp.mjs', import.meta.url));

export async function createHarness(
  t: test.TestContext,
  initialControl: Record<string, unknown> = {},
  initialAuth?: Record<string, unknown>,
) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'buildr-agy-int-')));
  const cwd = path.join(root, 'workspace');
  const binDir = path.join(root, 'managed-bin');
  const configRoot = path.join(root, 'connections', 'antigravity');
  const cliDir = path.join(configRoot, 'home', '.gemini', 'antigravity-cli');
  const executable = path.join(binDir, 'antigravity-acp.mjs');
  const keyringFile = path.join(cliDir, 'fixture-keyring.json');
  const controlFile = path.join(cliDir, 'fixture-control.json');

  await mkdir(cwd, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await mkdir(cliDir, { recursive: true });
  await copyFile(fixtureSource, executable);
  await writeFile(controlFile, JSON.stringify(initialControl, null, 2) + '\n');
  if (initialAuth) {
    await writeFile(keyringFile, JSON.stringify(initialAuth, null, 2) + '\n');
  }

  const environment: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: root,
  };

  const executor = createAntigravityExecutor();
  const openedRuntimes: Array<{ close(): Promise<void> }> = [];

  t.after(async () => {
    await Promise.allSettled(openedRuntimes.map(rt => rt.close()));
    await rm(root, { recursive: true, force: true });
  });

  async function setControl(patch: Record<string, unknown>) {
    const current = JSON.parse(await readFile(controlFile, 'utf8').catch(() => '{}'));
    await writeFile(controlFile, JSON.stringify({ ...current, ...patch }, null, 2) + '\n');
  }

  async function setAuth(nextAuth: Record<string, unknown>) {
    await writeFile(keyringFile, JSON.stringify(nextAuth, null, 2) + '\n');
  }

  async function readFixtureJsonl(fileName: string): Promise<any[]> {
    const target = path.join(configRoot, 'home', '.gemini', 'antigravity-cli', fileName);
    try {
      const text = await readFile(target, 'utf8');
      return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  async function openRuntime(extra: {
    interactionInstructions?: string;
    binding?: { identity: string; data?: Record<string, unknown>; executable?: string; configRoot?: string };
    preferredBinding?: { identity: string; data?: Record<string, unknown> };
    nativeSource?: {
      accountId: string;
      accountIdentity: string;
      modelId: string;
      model: { id: string; label: string; images?: boolean; tools?: boolean };
    };
  } = {}) {
    const rt = await executor.open({
      connectionId: 'antigravity',
      configRoot,
      executable,
      environment,
      ...(extra.interactionInstructions
        ? { interaction: { version: 'buildr-interaction/v1', instructions: extra.interactionInstructions } }
        : {}),
      ...(extra.binding ? { binding: extra.binding } : {}),
      ...(extra.preferredBinding ? { preferredBinding: extra.preferredBinding } : {}),
      ...(extra.nativeSource ? { nativeSource: extra.nativeSource } : {}),
    });
    openedRuntimes.push(rt);
    return rt;
  }

  return {
    root,
    cwd,
    configRoot,
    executable,
    environment,
    executor,
    setControl,
    setAuth,
    readFixtureJsonl,
    openRuntime,
  };
}
