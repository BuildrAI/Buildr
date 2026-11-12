import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { claimStorage } from '../../src/process/ownership.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { nativeSessionReferences } from '../../src/application/native-session-references.ts';
import { nativeStateThreads, pruneNativeStateThreads, type NativeStateThread } from '../../src/storage/native-state.ts';
import { observeStorageUse } from '../../src/storage/files.ts';

const receiptKind = 'buildr.agent.native-state-reclamation';
const day = 24 * 60 * 60_000;

interface Receipt {
  schemaVersion: 1; kind: string; dataRoot: string;
  items: Array<{ home: string; threadId: string; updatedAtMs: number }>;
}

const args = process.argv.slice(2);
const value = (name: string): string | undefined => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const dataRoot = value('--data-root');
const receiptPath = value('--receipt');
const confirm = args.includes('--confirm');
const limit = Number(value('--limit') ?? 256);
if (!dataRoot || !path.isAbsolute(dataRoot)) fail('必须提供绝对的 --data-root（例如 Buildr Dev 配置目录）');
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) fail('--limit 必须是 1 到 256 的整数');
const root = path.join(path.resolve(dataRoot), 'agent-service');

function fail(message: string): never { process.stderr.write(message + '\n'); process.exit(2); }
function write(result: unknown, persist = true): void {
  const text = JSON.stringify(result, null, 2) + '\n';
  if (persist && receiptPath) fs.writeFileSync(path.resolve(receiptPath), text);
  process.stdout.write(text);
}

function inventory() {
  const repository = new ConversationRepository(root);
  const references = nativeSessionReferences(root, repository);
  const plan = nativeStateThreads(root, observeStorageUse(), Date.now() - day, references);
  return { plan, references };
}

function summarize(plan: ReturnType<typeof nativeStateThreads>, extra: Record<string, unknown> = {}) {
  const eligible = plan.threads.filter(thread => thread.eligible);
  return {
    schemaVersion: 1 as const, kind: receiptKind, generatedAt: new Date().toISOString(), dataRoot: path.resolve(dataRoot!), confirm,
    count: plan.threads.length, eligible: eligible.length,
    retained: plan.threads.filter(thread => !thread.eligible).reduce<Record<string, number>>((groups, thread) => { groups[thread.reason] = (groups[thread.reason] ?? 0) + 1; return groups; }, {}),
    diagnostics: plan.diagnostics,
    items: plan.threads.map(thread => ({ home: thread.home, threadId: thread.threadId, title: thread.title, updatedAtMs: thread.updatedAtMs, reason: thread.reason, eligible: thread.eligible })),
    ...extra,
  };
}

if (!confirm) {
  write(summarize(inventory().plan));
} else {
  if (!receiptPath) fail('--confirm 必须同时提供经人工核对的 dry-run --receipt 文件');
  let receipt: Receipt;
  try { receipt = JSON.parse(fs.readFileSync(path.resolve(receiptPath), 'utf8')) as Receipt; } catch { fail('无法读取 --receipt 文件'); }
  if (receipt?.schemaVersion !== 1 || receipt.kind !== receiptKind || receipt.dataRoot !== path.resolve(dataRoot!) || !Array.isArray(receipt.items)) fail('--receipt 与本次 dataRoot 或格式不匹配');
  const reviewed = new Set(receipt.items.map(item => item.home + ':' + item.threadId));
  const lock = claimStorage(path.resolve(dataRoot!));
  let result: { results: Array<{ home: string; threadId: string; status: string; reason: string }>; diagnostics: string[] };
  let matched: NativeStateThread[] = [];
  try {
    const { plan, references } = inventory();
    matched = plan.threads.filter(thread => thread.eligible && reviewed.has(thread.home + ':' + thread.threadId)).slice(0, limit);
    for (const thread of plan.threads) if (thread.eligible && !reviewed.has(thread.home + ':' + thread.threadId)) plan.diagnostics.push('native_state_thread_not_in_receipt:' + thread.threadId);
    result = pruneNativeStateThreads(root, matched, references, observeStorageUse, Date.now() + 30000);
    result.diagnostics.push(...plan.diagnostics);
  } finally { lock.release(); }
  write({
    schemaVersion: 1 as const, kind: receiptKind, generatedAt: new Date().toISOString(), dataRoot: path.resolve(dataRoot!), confirm: true,
    receipt: path.resolve(receiptPath), reviewed: receipt.items.length, matched: matched.length,
    removed: result.results.filter(item => item.status === 'removed').length,
    results: result.results, diagnostics: result.diagnostics,
  }, false);
}
