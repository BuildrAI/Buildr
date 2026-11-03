import fs from 'node:fs';
import path from 'node:path';
import type { AgentExecutor } from '../../contracts.ts';
import { safeStoragePath } from '../../storage/files.ts';

type Resource = ReturnType<NonNullable<NonNullable<AgentExecutor['storage']>['diagnostics']>>[number];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const runPid = (name: string) => {
  const match = /^\d{4}-\d{2}-\d{2}T[\w+.:_-]+-p([1-9]\d*)$/.exec(name);
  const pid = Number(match?.[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
};

/** Only known native log shapes are declared. projects/, credentials and unknown files stay outside. */
export function qoderDiagnosticResources(configRoot: string): Resource[] {
  const result: Resource[] = [], root = path.join(configRoot, 'qoder-config', 'logs');
  if (!safeStoragePath(configRoot, root)) return result;
  const names = (directory: string) => safeStoragePath(configRoot, directory) ? fs.readdirSync(directory).sort() : [];
  for (const name of names(root)) {
    const match = /^sdk-daemon-([1-9]\d*)-\d+\.log$/.exec(name);
    if (match) result.push({ relativePath: path.relative(configRoot, path.join(root, name)), producerPid: Number(match[1]) });
  }
  const runs = path.join(root, 'runs');
  for (const name of names(runs)) {
    const directory = path.join(runs, name), pid = runPid(name);
    if (!pid || !safeStoragePath(configRoot, directory)) continue;
    let valid = false;
    try {
      const manifest = path.join(directory, 'manifest.json'), info = fs.lstatSync(manifest);
      if (info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size <= 64 * 1024 &&
          names(directory).every(file => ['qodercli.log', 'manifest.json'].includes(file))) {
        const body = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        valid = body.run_id === name && body.pid === pid && body.process_role === 'main' &&
          /^1\.1\.\d+$/.test(body.cli_version ?? '') && Number.isFinite(Date.parse(body.started_at));
      }
    } catch { /* Unknown native metadata is not permission to delete. */ }
    result.push({ relativePath: path.relative(configRoot, directory), producerPid: valid ? pid : undefined,
      ...(!valid ? { reason: 'diagnostic_identity_unknown' } : {}) });
  }
  const sessions = path.join(root, 'sessions');
  for (const namespace of names(sessions)) {
    const parent = path.join(sessions, namespace);
    for (const contextId of names(parent)) {
      if (!uuid.test(contextId)) continue;
      const segments = path.join(parent, contextId, 'segments');
      for (const name of names(segments)) {
        if (!name.endsWith('.jsonl')) continue;
        const pid = runPid(name.slice(0, -6));
        result.push({ relativePath: path.relative(configRoot, path.join(segments, name)), contextId, producerPid: pid,
          ...(!pid ? { reason: 'diagnostic_identity_unknown' } : {}) });
      }
    }
  }
  return result;
}
