import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type QoderProviderRegistration = {
  id: string;
  provider: Record<string, unknown>;
};

/** Qoder resolves custom models only from the persisted settings file, one per connection. */
function settingsFile(configDir: string): string {
  return join(configDir, 'settings.json');
}

// Settings writes are read-modify-write and shared by every lease of a connection.
// Serialize per file so concurrent opens cannot drop a sibling provider.
const queues = new Map<string, Promise<unknown>>();

function serial<T>(file: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.then(work, work);
  queues.set(file, next.catch(() => undefined));
  return next;
}

async function readSettings(file: string): Promise<Record<string, any>> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Never replace a settings file we cannot understand; the user may still own it.
    throw new Error('qoder_settings_unreadable');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('qoder_settings_unreadable');
  return parsed as Record<string, any>;
}

async function writeSettings(file: string, value: Record<string, unknown>): Promise<void> {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    // Settings hold a live lease key, so never leave it world-readable.
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function providers(settings: Record<string, any>): Record<string, any> {
  const current = settings.providers;
  return current && typeof current === 'object' && !Array.isArray(current) ? current : {};
}

export function registerQoderProvider(configDir: string, registration: QoderProviderRegistration): Promise<void> {
  const file = settingsFile(configDir);
  return serial(file, async () => {
    const settings = await readSettings(file);
    settings.providers = { ...providers(settings), [registration.id]: registration.provider };
    await writeSettings(file, settings);
  });
}

export function unregisterQoderProvider(configDir: string, registration: QoderProviderRegistration): Promise<void> {
  const file = settingsFile(configDir);
  return serial(file, async () => {
    const settings = await readSettings(file);
    const current = providers(settings);
    const retained = current[registration.id];
    // Only remove the exact entry this lease wrote; a newer lease keeps its own route.
    if (!retained || retained.baseUrl !== registration.provider.baseUrl) return;
    delete current[registration.id];
    settings.providers = current;
    await writeSettings(file, settings);
  });
}
