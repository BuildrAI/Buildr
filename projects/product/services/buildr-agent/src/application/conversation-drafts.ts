import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ConversationView, RunView, SendDraft, SendPreview, StartConversationDraft } from '../contracts.ts';
import type { StoredConversation } from '../domain/agent-state.ts';
import { expected, fail } from '../domain/agent-state.ts';
import { normalizeSendDraft } from '../domain/send-draft.ts';
import type { ConversationRepository } from '../persistence/conversation-repository.ts';
import { DraftImageRepository } from '../persistence/draft-image-repository.ts';

type Ports = {
  root: string; repository: ConversationRepository; source(scope: string): string;
  candidate(scope: string, input: { cwd?: string; taskId?: string }): Promise<StoredConversation>;
  prepare(record: StoredConversation, input: SendDraft): SendPreview;
  submit(record: StoredConversation, input: SendDraft & { previewToken: string; clientRequestId: string }): { run: RunView; conversation: ConversationView };
  read(scope: string, id: string): ConversationView;
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Owns the transition from source-local staged material to an accepted first input. */
export class ConversationDrafts {
  private readonly ports: Ports;
  private readonly images: DraftImageRepository;
  private readonly starting = new Map<string, { digest: string; work: Promise<{ conversation: ConversationView }> }>();
  constructor(ports: Ports) { this.ports = ports; this.images = new DraftImageRepository(ports.root); }
  list(scope: string, id: string) { return this.images.list(this.ports.source(scope), id); }
  add(scope: string, id: string, input: Parameters<DraftImageRepository['add']>[2]) { return this.images.add(this.ports.source(scope), id, input); }
  remove(scope: string, id: string, input: { expectedRevision: string; attachmentId: string }) { return this.images.remove(this.ports.source(scope), id, [input.attachmentId], input.expectedRevision); }
  image(scope: string, id: string, attachmentId: string) {
    const image = this.images.read(this.ports.source(scope), id, attachmentId);
    return { bytes: Buffer.from(image.bytes), mimeType: image.mimeType };
  }
  identity(scope: string, id: string, requestId: string): string {
    if (![id, requestId].every(value => /^[a-f0-9-]{36}$/.test(value))) fail('agent_draft_invalid', '草稿或提交身份无效。');
    const value = digest([this.ports.source(scope), id, requestId]);
    return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20,32)}`;
  }
  lookup(scope: string, id: string, requestId: string): { found: boolean; conversation?: ConversationView } {
    const record = this.ports.repository.readConversation(this.identity(scope, id, requestId));
    if (!record) return { found: false };
    if (record.view.workspaceId !== scope || record.initialDraft?.id !== id || record.initialDraft.requestId !== requestId) fail('agent_request_conflict', '原提交归属不匹配，请核对工作空间。', 409);
    return { found: true, conversation: this.ports.read(scope, record.view.id) };
  }
  start(scope: string, id: string, input: StartConversationDraft): Promise<{ conversation: ConversationView }> {
    const target = this.identity(scope, id, input.clientRequestId);
    const normalized = normalizeSendDraft({ ...input, expectedRevision: 'new' });
    const signature = digest({ scope, cwd: input.cwd, taskId: input.taskId, input: normalized });
    const previous = this.ports.repository.readConversation(target);
    if (previous) {
      if (previous.initialDraft?.digest !== signature) fail('agent_request_conflict', '同一提交身份对应不同内容，已拒绝重复创建。', 409);
      this.clearSubmitted(scope, id, normalized.attachmentIds ?? []);
      return Promise.resolve({ conversation: this.ports.read(scope, target) });
    }
    const pending = this.starting.get(target);
    if (pending) {
      if (pending.digest !== signature) fail('agent_request_conflict', '此提交正在处理其他内容。', 409);
      return pending.work;
    }
    const work = this.begin(scope, id, target, input, normalized, signature).finally(() => this.starting.delete(target));
    this.starting.set(target, { digest: signature, work });
    return work;
  }
  private clearSubmitted(scope: string, id: string, ids: string[]) {
    // Acceptance is authoritative even if derived staging cleanup cannot finish.
    if (ids.length) { try { this.images.remove(this.ports.source(scope), id, ids); } catch {} }
  }
  private async begin(scope: string, id: string, target: string, input: StartConversationDraft, normalized: SendDraft, signature: string) {
    const record = await this.ports.candidate(scope, input);
    record.view.id = target;
    record.initialDraft = { id, requestId: input.clientRequestId, digest: signature };
    const source = this.ports.source(scope), staged = this.images.list(source, id);
    expected(staged.revision, input.expectedDraftRevision);
    const ids = normalized.attachmentIds ?? [];
    if (new Set(ids).size !== ids.length) fail('agent_attachments_invalid', '图片身份重复。');
    const originals = ids.map(key => this.images.read(source, id, key));
    if(originals.length>4||originals.some(image=>image.frame))fail('agent_attachments_invalid','请选择最多4份原始材料。');
    const allIds=[...new Set([...ids,...originals.flatMap(image=>image.video?.frames.map(frame=>frame.id)??[])])];
    const selected = allIds.map(key => this.images.read(source,id,key));
    const parent = path.join(this.ports.root, 'attachments'), directory = path.join(parent, target);
    let copied = false;
    try {
      if (selected.length) {
        fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
        if (fs.lstatSync(parent).isSymbolicLink()) fail('agent_attachment_unsafe', '附件目录来源不安全。', 409);
        // The deterministic target is owned by this exact submission. Never reuse unknown files.
        const exists = fs.lstatSync(directory, { throwIfNoEntry: false });
        if (exists) {
          if (!exists.isDirectory() || exists.isSymbolicLink() || JSON.stringify(fs.readdirSync(directory).sort()) !== JSON.stringify(allIds.toSorted())) fail('agent_attachment_unsafe', '原提交图片副本无法安全确认。', 409);
          for (const image of selected) {
            const filename = path.join(directory, image.id), stat = fs.lstatSync(filename);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !fs.readFileSync(filename).equals(Buffer.from(image.bytes))) fail('agent_attachment_unsafe', '原提交图片副本已变化。', 409);
          }
        } else {
          fs.mkdirSync(directory, { mode: 0o700 }); copied = true;
          for (const image of selected) fs.writeFileSync(path.join(directory, image.id), image.bytes, { flag: 'wx', mode: 0o600 });
        }
        for (const image of selected) record.attachments[image.id] = { mimeType: image.mimeType, size: image.size, createdAt: new Date().toISOString(), ...(image.video ? {video:image.video} : {}) };
      }
      const draft = { ...normalized, expectedRevision: record.view.revision };
      const preview = this.ports.prepare(record, draft);
      const result = this.ports.submit(record, { ...draft, previewToken: preview.token, clientRequestId: input.clientRequestId });
      this.clearSubmitted(scope, id, ids);
      return { conversation: result.conversation };
    } catch (error) {
      let persisted: StoredConversation | undefined;
      try { persisted = this.ports.repository.readConversation(target); }
      catch { fail('agent_first_send_result_unknown', '首次提交的保存结果待核对；草稿已保留，不会自动重发。', 503); }
      if (persisted) fail('agent_first_send_result_unknown', '首次提交已保存，显示结果尚待核对；请读取原提交，不要另建请求。', 503);
      if (copied) fs.rmSync(directory, { recursive: true });
      throw error;
    }
  }
}
