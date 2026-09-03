import path from 'node:path';
import { convergenceDigest, normalizeConvergenceText, validateConvergenceReceipt } from './convergence-model.ts';

export function observeConvergence({ projectRoot, receipt, archived = false, io }: any) {
  validateConvergenceReceipt(receipt);
  const files = receipt.files.map((item: any) => {
    const file = path.resolve(projectRoot, item.path);
    if (!file.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) throw new Error('OpenSpec convergence target escapes Project root.');
    const exists = io.existsSync(file);
    const actualDigest = exists ? convergenceDigest(normalizeConvergenceText(io.readFileSync(file, 'utf8'))) : null;
    const beforeExists = item.beforeExists !== false;
    const expectedExists = item.expectedExists !== false;
    const state = exists === expectedExists && actualDigest === item.expectedDigest ? 'expected'
      : exists === beforeExists && actualDigest === item.beforeDigest ? 'before'
        : 'unknown';
    return { path: item.path, beforeDigest: item.beforeDigest, expectedDigest: item.expectedDigest, actualDigest, state };
  });
  const states = new Set(files.map((item: any) => item.state));
  let disposition = 'state-unknown';
  if (states.size === 1 && states.has('before')) disposition = 'planned-not-applied';
  else if (states.size === 1 && states.has('expected')) disposition = archived ? 'archived' : 'applied-and-matched';
  return { disposition, files };
}
