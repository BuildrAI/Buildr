import type { TaskPersistence, TaskListInputDto } from '../../application/task-dto.ts';
import { taskActionId } from '../../application/task-validation.ts';
import type { TaskMaterialsApplication } from './task-materials-application.ts';
import { documentError } from './task-project-document-reader.ts';
import { normalizeTaskBriefLinks } from './task-brief-links.ts';

type TaskQuery = {
  readTask(root: string, taskId: string): TaskPersistence;
  queryTasks(root: string, input?: TaskListInputDto): { tasks: Array<{ record: { taskId: string } }>; nextCursor?: string | null };
};
type TaskCommands = { importTaskBrief(root: string, taskId: string, input: { expectedRecordDigest: string; brief: string }): unknown };
export type BriefMigrationInput = { dryRun?: boolean; expectedRecordDigest?: string; expectedMaterialsDigest?: string; expectedDocumentDigest?: string };

export function createTaskBriefMigrationApplication(taskQuery: TaskQuery, taskCommands: TaskCommands, materials: TaskMaterialsApplication) {
  function migrateTaskBrief(root: string, taskId: string, input: BriefMigrationInput = {}) {
    taskActionId(taskId, 'taskId');
    const task = taskQuery.readTask(root, taskId);
    if (input.expectedRecordDigest && task.recordDigest !== input.expectedRecordDigest) throw documentError('task_record_conflict', '任务记录已变化，请重新观察后导入。', 409);
    const source = materials.inspectLegacyTaskBrief(root, taskId);
    const observation = { recordDigest: task.recordDigest, materialsDigest: source.materialsDigest, documentDigest: source.document?.actualDigest || null };
    if (input.expectedMaterialsDigest && input.expectedMaterialsDigest !== source.materialsDigest) throw documentError('task_materials_conflict', '旧说明关联已变化，请重新观察。', 409);
    if (input.expectedDocumentDigest && input.expectedDocumentDigest !== (source.document?.actualDigest || 'absent')) throw documentError('task_materials_document_conflict', '旧说明正文已变化，请重新观察。', 409);
    if (!source.reference) return { taskId, status: task.record.brief ? 'already-present' : 'no-legacy-brief', observation, rewrittenLinks: 0, diagnostics: [] };
    // An explicitly requested migration may release a retired association without editing
    // an already established record body, including recovery after a partial import.
    if (task.record.brief !== null) {
      if (input.dryRun) return { taskId, status: 'release-ready', observation, rewrittenLinks: 0, diagnostics: [] };
      const released = materials.releaseLegacyTaskBrief(root, taskId, source.materialsDigest, () => {
        const current = taskQuery.readTask(root, taskId);
        if (current.recordDigest !== task.recordDigest) throw documentError('task_record_conflict', '任务记录已变化，请重新观察后释放旧关联。', 409);
        return { record: current.record, recordDigest: current.recordDigest, effects: [] };
      });
      return { taskId, status: 'association-released', observation, rewrittenLinks: 0, diagnostics: [], result: released.result, materialsDigest: released.materialsDigest };
    }
    if (!source.document?.exists || source.document.diagnostic || !source.document.content?.trim()) return { taskId, status: 'source-unavailable', observation, rewrittenLinks: 0, diagnostics: [source.document?.diagnostic || { code: 'task_brief_source_missing', message: '旧独立任务说明当前不可读取。' }] };
    const normalized = normalizeTaskBriefLinks(source.document.content, source.reference, source.materials.documents);
    if (input.dryRun) return { taskId, status: 'ready', observation, rewrittenLinks: normalized.rewrittenLinks, diagnostics: normalized.diagnostics };
    const result = materials.migrateLegacyTaskBrief(root, taskId, { expectedMaterialsDigest: source.materialsDigest, expectedDocumentDigest: source.document.actualDigest! }, observed => {
      const current = taskQuery.readTask(root, taskId);
      if (current.recordDigest !== task.recordDigest) throw documentError('task_record_conflict', '任务记录已变化，请重新观察后导入。', 409);
      const currentContent = normalizeTaskBriefLinks(observed.document!.content!, observed.reference!, observed.materials.documents).content;
      if (current.record.brief === currentContent) return { record: current.record, recordDigest: current.recordDigest, effects: [] };
      if (current.record.brief !== null) throw documentError('task_brief_already_present', '任务已有新的说明正文，不能覆盖。', 409);
      return taskCommands.importTaskBrief(root, taskId, { expectedRecordDigest: current.recordDigest, brief: currentContent });
    });
    return { taskId, status: result.status, observation, rewrittenLinks: normalized.rewrittenLinks, diagnostics: [...normalized.diagnostics, ...(result.diagnostic ? [result.diagnostic] : [])], result: result.result, materialsDigest: result.materialsDigest };
  }
  function migrateTaskBriefs(root: string, input: { dryRun?: boolean } = {}) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = taskQuery.queryTasks(root, { status: 'all', pageSize: '100', ...(cursor ? { cursor } : {}) });
      ids.push(...page.tasks.map(item => item.record.taskId));
      cursor = page.nextCursor || undefined;
    } while (cursor);
    const results = [...new Set(ids)].map(taskId => {
      try { return migrateTaskBrief(root, taskId, input); }
      catch (cause) { return { taskId, status: 'failed', rewrittenLinks: 0, diagnostics: [{ code: cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : 'task_brief_migration_failed', message: cause instanceof Error ? cause.message : '任务说明迁移失败。' }] }; }
    });
    const counts: Record<string, number> = {};
    for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
    return { schemaVersion: 'buildr.task-brief-migration-batch/v1', status: results.some(item => ['failed', 'partial', 'source-unavailable'].includes(item.status)) ? 'partial' : 'completed', dryRun: Boolean(input.dryRun), counts, results };
  }
  return Object.freeze({ migrateTaskBrief, migrateTaskBriefs });
}
export type TaskBriefMigrationApplication = ReturnType<typeof createTaskBriefMigrationApplication>;
