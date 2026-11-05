import fs from 'node:fs';

/** Consume the existing timing/coverage evidence, never scrape human-readable logs. */
export function readFailedVerificationGroups(file: string, evidence: any = JSON.parse(fs.readFileSync(file, 'utf8'))): string[] {
  const entries = evidence.coverage?.selected ?? evidence.steps;
  if (!Array.isArray(entries)) throw new Error('Failure evidence requires coverage.selected or steps.');
  const statuses = new Set(['passed', 'failed', 'timed-out', 'blocked', 'not-run', 'unavailable']);
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || !statuses.has(entry.status)) throw new Error('Invalid failure evidence entry: expected check id and known status.');
  }
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate check id in failure evidence.');
  return [...new Set<string>(entries.filter(entry => entry.status !== 'passed').map(entry => entry.id))];
}
