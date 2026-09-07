import type fs from 'node:fs';
import type { ConvergencePlan, ConvergenceFile, ExecutableIdentity } from './convergence-model.ts';
import path from 'node:path';
import { convergenceDigest, normalizeConvergenceText } from './convergence-model.ts';

export function applyCanonicalPlan({ projectRoot, plan, currentDeltaDigest, currentExecutableIdentity, io }: { projectRoot: string; plan: ConvergencePlan; currentDeltaDigest: string; currentExecutableIdentity: ExecutableIdentity; io: typeof fs }) {
  if (currentDeltaDigest !== plan.deltaDigest || JSON.stringify(currentExecutableIdentity) !== JSON.stringify(plan.executableIdentity)) {
    return { status: 'input-changed', effects: [] };
  }
  const prepared: (ConvergenceFile & { file: string; changed: boolean; beforeExists: boolean; expectedExists: boolean })[] = [];
  for (const item of plan.files) {
    const file = path.resolve(projectRoot, item.path);
    if (!file.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) throw new Error('OpenSpec convergence target escapes Project root.');
    const exists = io.existsSync(file);
    const beforeExists = item.beforeExists !== false;
    const expectedExists = item.expectedExists !== false;
    const actual = exists ? convergenceDigest(normalizeConvergenceText(io.readFileSync(file, 'utf8'))) : null;
    if (exists !== beforeExists || actual !== item.beforeDigest) return { status: 'input-changed', effects: [] };
    if ((expectedExists && convergenceDigest(normalizeConvergenceText(item.expectedContent)) !== item.expectedDigest)
      || (!expectedExists && item.expectedDigest !== null)) throw new Error('OpenSpec convergence expected content digest mismatch.');
    prepared.push({ ...item, beforeExists, expectedExists, file, changed: beforeExists !== expectedExists || item.beforeDigest !== item.expectedDigest });
  }
  const temporaries: (typeof prepared[number] & { temporary: string })[] = [];
  const committed: typeof prepared = [];
  try {
    for (const item of prepared.filter((entry) => entry.changed && entry.expectedExists)) {
      io.mkdirSync(path.dirname(item.file), { recursive: true });
      const temporary = `${item.file}.buildr-converge-${process.pid}-${temporaries.length}`;
      io.writeFileSync(temporary, item.expectedContent);
      if (convergenceDigest(normalizeConvergenceText(io.readFileSync(temporary, 'utf8'))) !== item.expectedDigest) throw new Error('OpenSpec convergence temporary verification failed.');
      temporaries.push({ ...item, temporary });
    }
    for (const item of prepared.filter((entry) => entry.changed && !entry.expectedExists)) {
      io.rmSync(item.file, { force: true });
      committed.push(item);
    }
    for (const item of temporaries) {
      io.renameSync(item.temporary, item.file);
      committed.push(item);
    }
  } catch (error) {
    for (const item of temporaries) if (io.existsSync(item.temporary)) io.rmSync(item.temporary, { force: true });
    for (const item of committed.reverse()) {
      if (item.beforeExists) io.writeFileSync(item.file, item.beforeContent);
      else io.rmSync(item.file, { force: true });
    }
    throw error;
  }
  return {
    status: 'passed',
    effects: prepared.filter((item) => item.changed).map((item) => ({ path: item.path, digest: item.expectedDigest, type: item.expectedExists ? 'updated' : 'deleted' })),
  };
}
