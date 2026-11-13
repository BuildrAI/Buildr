import fs from 'node:fs';
import path from 'node:path';
import { nativeContentFiles } from '../native-content.ts';
import { ensureStorageDirectory, safeStoragePath } from '../../storage/files.ts';

/** Import only the official SDK's already-created fork, never account/config files. */
export async function importClaudeFork(source: string, target: string, sessionId: string, cwd: string, rebind?: (value: string) => Promise<string>, models?: {from:string;to:string}): Promise<void> {
  if (!/^[a-f0-9-]{36}$/.test(sessionId)) throw new Error('agent_fork_identity_invalid');
  const files = nativeContentFiles({root:source,configRoot:source,contextId:sessionId,cwd},
    path.join(source,'claude-config','projects'), file=>path.basename(file)===sessionId+'.jsonl',3);
  if (files.length !== 1) throw new Error('agent_fork_source_unavailable');
  const file = files[0]!, before = fs.lstatSync(file);
  if (!safeStoragePath(source,path.dirname(file)) || !before.isFile() || before.nlink !== 1 || before.size > 64*1024*1024) throw new Error('agent_fork_source_unsafe');
  const fd = fs.openSync(file,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW??0));
  let bytes: Buffer;
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error('agent_fork_source_changed');
    bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('agent_fork_source_changed');
  } finally { fs.closeSync(fd); }
  if (!bytes.length || bytes.at(-1) !== 10) throw new Error('agent_fork_source_incomplete');
  const lines = bytes.toString('utf8').trimEnd().split('\n');
  const output: string[] = [];
  for (const line of lines) {
    const row = JSON.parse(line);
    // Session identity, not the shell cwd, owns every record: a conversation
    // that entered a worktree still forks its complete native history.
    if (['user','assistant'].includes(row.type) && row.sessionId !== sessionId) throw new Error('agent_fork_source_binding_mismatch');
    let changed = false;
    for (const part of Array.isArray(row.message?.content) ? row.message.content : []) {
      if (part.type === 'redacted_thinking' && typeof part.data === 'string' && part.data.startsWith('buildr-v1.')) {
        if (!rebind) throw new Error('model_reasoning_binding_mismatch');
        part.data = await rebind(part.data); changed = true;
      }
    }
    // Lease aliases differ across conversations even when the underlying model
    // is identical. Claude otherwise treats resume as a model change and drops
    // signed thinking. Only change the exact known local alias in this new copy.
    if (models && row.type === 'assistant' && row.message?.model === models.from) {
      row.message.model = models.to; changed = true;
    }
    output.push(changed ? JSON.stringify(row) : line);
  }
  const destination = path.join(target,path.relative(source,file));
  ensureStorageDirectory(target,path.dirname(destination));
  // No links, no overwrite, and no mutation of the source session or its fork.
  fs.writeFileSync(destination,output.join('\n')+'\n',{flag:'wx',mode:0o600});
}
