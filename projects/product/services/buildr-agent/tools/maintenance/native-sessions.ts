import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { collectAgentStorage, inspectAgentStorage, type AgentStoragePlan } from '../../src/application/storage-maintenance.ts';
import type { StorageCandidate } from '../../src/storage/files.ts';

const receiptKind = 'buildr.agent.native-session-reclamation';

interface Receipt {
  schemaVersion: 1; kind: string; dataRoot: string;
  items: Array<Pick<StorageCandidate, 'path' | 'identity' | 'sizeBytes'>>;
}

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const dataRoot = value('--data-root');
const receiptPath = value('--receipt');
const confirm = args.includes('--confirm');
const limit = Number(value('--limit') ?? 256);
if (!dataRoot || !path.isAbsolute(dataRoot)) fail('必须提供绝对的 --data-root（例如 Buildr Dev 配置目录）');
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) fail('--limit 必须是 1 到 256 的整数');
const root = path.resolve(dataRoot);

function fail(message: string): never {
  process.stderr.write(message + '\n');
  process.exit(2);
}

function nativePlan(): AgentStoragePlan {
  const plan = inspectAgentStorage({ dataRoot: root, scanHomes: false, nativeSessions: true });
  return { ...plan, items: plan.items.filter(item => item.kind === 'native-session') };
}

function write(result: unknown, persist = true): void {
  const text = JSON.stringify(result, null, 2) + '\n';
  if (persist && receiptPath) fs.writeFileSync(path.resolve(receiptPath), text);
  process.stdout.write(text);
}

function summarize(plan: AgentStoragePlan, extra: Record<string, unknown> = {}) {
  const eligible = plan.items.filter(item => item.eligible);
  return {
    schemaVersion: 1 as const, kind: receiptKind, generatedAt: new Date().toISOString(), dataRoot: root,
    confirm,
    count: plan.items.length,
    eligible: eligible.length,
    eligibleBytes: eligible.reduce((sum, item) => sum + item.sizeBytes, 0),
    retained: plan.items.filter(item => !item.eligible).reduce<Record<string, number>>((groups, item) => {
      groups[item.reason] = (groups[item.reason] ?? 0) + 1; return groups;
    }, {}),
    diagnostics: plan.diagnostics,
    items: plan.items.map(item => ({
      path: item.path, provider: item.nativeSession?.provider, contextId: item.nativeSession?.contextId,
      binding: item.nativeSession?.binding, identity: item.identity, sizeBytes: item.sizeBytes,
      reason: item.reason, eligible: item.eligible,
    })),
    ...extra,
  };
}

if (!confirm) {
  const plan = nativePlan();
  write(summarize(plan));
} else {
  if (!receiptPath) fail('--confirm 必须同时提供经人工核对的 dry-run --receipt 文件');
  let receipt: Receipt;
  try { receipt = JSON.parse(fs.readFileSync(path.resolve(receiptPath), 'utf8')) as Receipt; }
  catch { fail('无法读取 --receipt 文件'); }
  if (receipt?.schemaVersion !== 1 || receipt.kind !== receiptKind || receipt.dataRoot !== root || !Array.isArray(receipt.items)) fail('--receipt 与本次 dataRoot 或格式不匹配');
  const reviewed = new Map(receipt.items.map(item => [item.path, item]));
  const planned = nativePlan();
  const matched: StorageCandidate[] = [];
  for (const item of planned.items) {
    const known = reviewed.get(item.path);
    if (known && known.identity === item.identity) matched.push(item);
    else planned.diagnostics.push((known ? 'native_session_changed_since_receipt' : 'native_session_not_in_receipt') + ':' + item.path);
  }
  const plan: AgentStoragePlan = { ...planned, items: matched };
  const result = collectAgentStorage(plan, limit, { confirmNativeSessions: true, budgetMs: 30000 });
  write({
    schemaVersion: 1 as const, kind: receiptKind, generatedAt: new Date().toISOString(), dataRoot: root, confirm: true,
    receipt: path.resolve(receiptPath), reviewed: receipt.items.length, matched: matched.length,
    removed: result.results.filter(item => item.status === 'removed').length,
    removedBytes: result.removedBytes, results: result.results, diagnostics: result.diagnostics,
  }, false);
}
