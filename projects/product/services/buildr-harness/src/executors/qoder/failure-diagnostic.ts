import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { errorDiagnostic } from '../../domain/error-diagnostic.ts';

const genericFailure = /^Sorry, something went wrong\. Please try again\.(?: Report Issue \(input \/feedback\))?$/;
const tailBytes = 256 * 1024;

/** Only explicit model failures belonging to the terminal native turn enrich its generic result.
 * Tool output, earlier turns and failures followed by a successful attempt are not evidence.
 */
export function qoderLoggedFailure(lines: string, startedAt: number, endedAt: number, errors: unknown, secrets: readonly string[] = []): string | undefined {
  if (!Array.isArray(errors) || errors.length !== 1 || typeof errors[0] !== 'string' || !genericFailure.test(errors[0])) return;
  const records: any[] = [];
  for (const line of lines.split('\n')) {
    try {
      const record = JSON.parse(line), at = Date.parse(record.ts);
      if (at >= startedAt && at <= endedAt && typeof record.turn_id === 'string') records.push(record);
    } catch { /* Incomplete tail/line: no evidence. */ }
  }
  const terminal = records.findLast(record => record.type === 'turn.finished');
  if (!terminal || terminal.data?.reason !== 'error' || terminal.data.error !== errors[0] || typeof terminal.request_id !== 'string') return;
  const request = records.findLast(record => record.type === 'model.request.attempt_failed' && record.turn_id === terminal.turn_id && record.request_id === terminal.request_id);
  if (!request || request.data?.will_retry !== false) return;
  const data = request.data;
  // Whitelist strings only. Never forward whole diagnostic envelopes, request bodies or headers.
  const causes = Array.isArray(data.error_cause_chain) ? data.error_cause_chain.slice(0, 4) : [];
  const messages = [data.error_message, ...causes.flatMap((cause: any) => [cause?.code, cause?.message])]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  return errorDiagnostic([...new Set(messages)].join(' · '), secrets);
}

/** Bounded private diagnostic read, scoped by exact session, native PID and current turn time.
 * Missing/changed logs only lose enrichment; they cannot change execution/permission facts.
 */
export async function qoderFailureDiagnostic(input: { configRoot?: string; sessionId: string; pid?: number; startedAt: number; errors: unknown; secrets?: readonly string[] }): Promise<string | undefined> {
  if (!input.configRoot || !input.pid || !/^[a-zA-Z0-9-]+$/.test(input.sessionId) || !Array.isArray(input.errors) || input.errors.length !== 1 || typeof input.errors[0] !== 'string' || !genericFailure.test(input.errors[0])) return;
  const root = path.join(input.configRoot, 'logs', 'sessions'), endedAt = Date.now();
  try {
    const namespaces = await readdir(root, { withFileTypes: true });
    if (namespaces.length > 128) return;
    for (const namespace of namespaces) {
      if (!namespace.isDirectory()) continue;
      const session = path.join(root, namespace.name, input.sessionId);
      // Verify each intermediate child, so symlinks cannot redirect to other private files.
      if (!(await lstat(session).catch(() => undefined))?.isDirectory()) continue;
      if (!(await lstat(path.join(session, 'segments')).catch(() => undefined))?.isDirectory()) continue;
      const segments = path.join(session, 'segments'), files = await readdir(segments, { withFileTypes: true });
      const exact = files.filter(entry => entry.isFile() && entry.name.endsWith(`-p${input.pid}.jsonl`));
      if (exact.length > 8) return;
      for (const entry of exact.sort((a, b) => b.name.localeCompare(a.name))) {
        const file = await open(path.join(segments, entry.name), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const stat = await file.stat();
          if (!stat.isFile()) continue;
          const buffer = Buffer.alloc(Math.min(stat.size, tailBytes));
          const { bytesRead } = await file.read(buffer, 0, buffer.length, Math.max(0, stat.size - buffer.length));
          const reason = qoderLoggedFailure(buffer.subarray(0, bytesRead).toString('utf8'), input.startedAt, endedAt, input.errors, input.secrets);
          if (reason) return reason;
        } finally { await file.close(); }
      }
    }
  } catch { /* Native result remains authoritative when diagnostics cannot be proved. */ }
  return;
}
