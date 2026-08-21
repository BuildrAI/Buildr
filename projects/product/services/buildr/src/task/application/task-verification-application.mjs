import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeTaskVerificationResult, taskVerificationError } from '../domain/task-verification.mjs';
import { isWorkspaceOnlyTaskRecord, taskRecordEffectiveProjectCodes } from '../domain/task-record.mjs';
import { parseProjectVerification, validateProjectVerification } from '../../system/doctor/application/project-verification-diagnostics.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../application/json-contracts.mjs';
import { declarationIntakeGapNextAction } from '../../application/declaration-intake/declaration-intake-trigger.mjs';
import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.mjs';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')}`;
}

function assertObject(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskVerificationError('task_verification_input_invalid', `${label} 必须是对象。`);
}

function assertFields(input, fields, label) {
  assertObject(input, label);
  for (const field of Object.keys(input)) {
    if (!fields.has(field)) throw taskVerificationError('task_verification_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
  }
}

function currentTarget(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw taskVerificationError('task_verification_target_invalid', 'targetIdentity 必须是非空字符串。', 400, { field: 'targetIdentity' });
  return value.trim();
}

function relative(root, file) {
  if (file.startsWith('workspace-sqlite:')) return file;
  return path.relative(root, file).split(path.sep).join('/');
}

function inside(parent, child) {
  const value = path.relative(path.resolve(parent), path.resolve(child));
  return value === '' || (!value.startsWith(`..${path.sep}`) && value !== '..' && !path.isAbsolute(value));
}

function regularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

export function registerTaskVerificationApplication(runtime) {
  function declarationSourceRoot(task, value) {
    if (value === undefined) return task.root;
    if (typeof value !== 'string' || !value.trim()) {
      throw taskVerificationError('task_verification_declaration_root_invalid', 'declarationRoot 必须是存在的 Workspace 路径。', 400, { field: 'declarationRoot' });
    }
    try {
      const sourceRoot = fs.realpathSync(value.trim());
      if (!fs.lstatSync(sourceRoot).isDirectory()) throw new Error('not a directory');
      const canonicalRoot = fs.realpathSync(task.root);
      if (!sameFilesystemPath(sourceRoot, canonicalRoot)) {
        const context = runtime.resolveTaskEnvironmentExecution?.(canonicalRoot, task.record.taskId);
        if (!context?.ready) {
          throw taskVerificationError('task_verification_declaration_root_unowned', 'declarationRoot 只能使用 canonical Workspace 或当前 ready Task Environment 根。', 409, {
            taskId: task.record.taskId,
            declarationRoot: sourceRoot,
            environmentStatus: context?.environment?.status || 'unavailable',
          });
        }
        const environmentRoot = fs.realpathSync(context.environmentRoot);
        if (!sameFilesystemPath(sourceRoot, environmentRoot)) {
          throw taskVerificationError('task_verification_declaration_root_unowned', 'declarationRoot 与当前 Task Environment 根不一致。', 409, {
            taskId: task.record.taskId,
            declarationRoot: sourceRoot,
            expectedEnvironmentRoot: environmentRoot,
          });
        }
      }
      return sourceRoot;
    } catch (error) {
      if (error.taskVerificationBusiness) throw error;
      throw taskVerificationError('task_verification_declaration_root_invalid', `declarationRoot 无法读取：${error.message}`, 400, { field: 'declarationRoot' });
    }
  }

  function observeDeclarations(task, rootInput = undefined) {
    const sourceRoot = declarationSourceRoot(task, rootInput);
    const projectCodes = taskRecordEffectiveProjectCodes(task.record);
    if (projectCodes.length === 0) return [];
    const registry = runtime.readProjectRegistryPersistence(sourceRoot).registry.projects;
    return projectCodes.map((projectCode) => {
      const project = registry[projectCode];
      if (!project) {
        return { project: projectCode, path: `projects/${projectCode}/verification.yml`, identity: 'unavailable', valid: false, declaration: null, diagnostic: `Project 未登记：${projectCode}` };
      }
      const projectRoot = path.resolve(sourceRoot, project.source.path);
      const declarationFile = path.join(projectRoot, 'verification.yml');
      const declarationPath = relative(sourceRoot, declarationFile);
      if (!inside(sourceRoot, projectRoot)) {
        return { project: projectCode, path: declarationPath, identity: 'unavailable', valid: false, declaration: null, diagnostic: `Project source 逃逸 Workspace：${project.source.path}` };
      }
      if (!fs.existsSync(declarationFile)) {
        return { project: projectCode, path: declarationPath, identity: 'absent', valid: true, declaration: null, diagnostic: null };
      }
      if (!regularFile(declarationFile)) {
        return { project: projectCode, path: declarationPath, identity: 'unavailable', valid: false, declaration: null, diagnostic: `${declarationPath} 必须是普通文件。` };
      }
      let content;
      try { content = fs.readFileSync(declarationFile); } catch (error) {
        return { project: projectCode, path: declarationPath, identity: 'unavailable', valid: false, declaration: null, diagnostic: `${declarationPath} 无法读取：${error.message}` };
      }
      const identity = digest(content);
      try {
        const declaration = parseProjectVerification(content.toString('utf8'), declarationPath);
        const serviceRegistry = runtime.readServiceRegistryPersistence?.(sourceRoot, project, project.workspaceId)?.registry?.services || {};
        const errors = validateProjectVerification(declaration, { projectCode, services: Object.keys(serviceRegistry) });
        if (errors.length) return { project: projectCode, path: declarationPath, identity, valid: false, declaration, diagnostic: errors.join('; ') };
        return { project: projectCode, path: declarationPath, identity, valid: true, declaration, diagnostic: null };
      } catch (error) {
        return { project: projectCode, path: declarationPath, identity, valid: false, declaration: null, diagnostic: error.message };
      }
    });
  }

  function declarationValues(observations) {
    return observations.map(({ project, path: declarationPath, identity }) => ({ project, path: declarationPath, identity }));
  }

  function applicability(result, currentTargetIdentity, declarationsInput) {
    const targetStatus = currentTargetIdentity === undefined ? 'unknown' : result.target.identity === currentTargetIdentity ? 'current' : 'stale';
    const expected = new Map(result.declarations.map((item) => [item.project, item]));
    const actual = declarationsInput === undefined ? null : new Map(declarationsInput.map((item) => [item.project, item]));
    const reasons = [];
    if (currentTargetIdentity === undefined) {
      reasons.push({ axis: 'target', code: 'target-identity-not-provided', message: 'Caller 未提供 current target identity；未执行外部观察。' });
    }
    if (actual == null) {
      reasons.push({ axis: 'declaration', code: 'declaration-identities-not-provided', message: 'Caller 未提供 current declaration identities；未执行外部观察。' });
    }
    if (actual) {
      for (const [project, declaration] of expected) {
        const observed = actual.get(project);
        if (!observed) reasons.push({ axis: 'declaration', project, code: 'project-scope-removed', message: `Project 已不在 Task scope：${project}` });
        else if (observed.path !== declaration.path) reasons.push({ axis: 'declaration', project, code: 'declaration-path-changed', message: `${declaration.path} -> ${observed.path}` });
        else if (observed.identity !== declaration.identity) reasons.push({ axis: 'declaration', project, code: 'declaration-identity-changed', message: `${declaration.identity} -> ${observed.identity}` });
      }
      for (const project of actual.keys()) {
        if (!expected.has(project)) reasons.push({ axis: 'declaration', project, code: 'project-scope-added', message: `Task scope 新增 Project：${project}` });
      }
    }
    if (targetStatus === 'stale') reasons.unshift({ axis: 'target', code: 'target-identity-changed', message: `${result.target.identity} -> ${currentTargetIdentity}` });
    const declarationsStatus = actual == null ? 'unknown' : reasons.some((item) => item.axis === 'declaration') ? 'stale' : 'current';
    const status = targetStatus === 'stale' || declarationsStatus === 'stale' ? 'stale' : targetStatus === 'current' && declarationsStatus === 'current' ? 'current' : 'unknown';
    return {
      status,
      target: { status: targetStatus, resultIdentity: result.target.identity, currentIdentity: currentTargetIdentity ?? null },
      declarations: { status: declarationsStatus },
      reasons,
    };
  }

  function slot(task, targetIdentity, declarationsInput = undefined) {
    const persisted = runtime.readTaskVerificationResultPersistence(task.root, task.record.taskId, { optional: true });
    if (!persisted) {
      return { path: runtime.taskVerificationResultPath(task.root, task.record.taskId), present: false, result: null, resultDigest: null, applicability: null };
    }
    return {
      path: persisted.file,
      present: true,
      result: persisted.result,
      resultDigest: persisted.resultDigest,
      observedAt: persisted.observedAt,
      applicability: applicability(persisted.result, targetIdentity, declarationsInput),
    };
  }

  function coverageGapNextActions(resultSlot) {
    const gaps = resultSlot?.result?.coverageGaps || [];
    const byProject = new Map();
    for (const gap of gaps) {
      const match = /^(?:project:([^/]+)|service:([^/]+)\/(.+))$/.exec(gap.scope);
      const project = match?.[1] || match?.[2];
      if (!project) continue;
      if (!byProject.has(project)) byProject.set(project, { services: new Set(), scopes: [] });
      if (match[3]) byProject.get(project).services.add(match[3]);
      byProject.get(project).scopes.push(gap.scope);
    }
    return [...byProject.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([project, value]) => declarationIntakeGapNextAction({
      kind: 'verification',
      project,
      services: [...value.services],
      scopes: value.scopes,
    }));
  }

  function operationResult(operation, status, taskId, resultSlot, effects = []) {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskVerificationOperationResult, {
      operation,
      status,
      taskId,
      slot: resultSlot,
      diagnostic: null,
      effects,
      nextActions: coverageGapNextActions(resultSlot),
    });
  }

  function inspectTaskVerification(targetRoot, taskId, input = {}) {
    assertFields(input, new Set(['targetIdentity', 'declarations']), 'Task Verification inspect');
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    const targetIdentity = currentTarget(input.targetIdentity);
    if (input.declarations !== undefined && !Array.isArray(input.declarations)) throw taskVerificationError('task_verification_declarations_invalid', 'declarations必须是保存identity数组。', 400, { field: 'declarations' });
    return operationResult('inspect', 'inspected', task.record.taskId, slot(task, targetIdentity, input.declarations));
  }

  function validateRecordAgainstDeclarations(task, observations, capabilities, coverageGaps) {
    const projects = new Set(taskRecordEffectiveProjectCodes(task.record));
    const workspaceOnly = isWorkspaceOnlyTaskRecord(task.record);
    const byProject = new Map(observations.map((item) => [item.project, item]));
    if (workspaceOnly) {
      if (observations.length !== 0 || capabilities.length !== 0 || coverageGaps.length !== 1 || coverageGaps[0].scope !== 'workspace') {
        throw taskVerificationError('task_verification_workspace_shape_invalid', '仅工作区 Task 必须记录空 declarations、空 capabilities 与唯一 workspace coverage gap。', 400, { taskId: task.record.taskId });
      }
      return;
    }
    if (observations.length === 0) {
      throw taskVerificationError('task_verification_declarations_required', '具有有效 Project scope 的 Task 必须绑定非空 declarations。', 400, { projects: [...projects] });
    }
    for (const observation of observations) {
      if (!observation.valid) {
        throw taskVerificationError('task_verification_declaration_invalid', `Project ${observation.project} verification declaration 无法绑定：${observation.diagnostic}`, 409, { project: observation.project, path: observation.path, identity: observation.identity });
      }
      if (observation.identity === 'absent' && !coverageGaps.some((gap) => gap.scope === `project:${observation.project}`)) {
        throw taskVerificationError('task_verification_coverage_gap_required', `Project ${observation.project} 没有 verification.yml，必须记录 project:${observation.project} coverage gap。`, 400, { project: observation.project });
      }
    }
    for (const item of capabilities) {
      if (!projects.has(item.project)) throw taskVerificationError('task_verification_capability_project_out_of_scope', `Capability Project 不在 Task scope：${item.project}。`, 400, { project: item.project, capability: item.capability });
      const observation = byProject.get(item.project);
      const capability = observation?.declaration?.capabilities.find((candidate) => candidate.id === item.capability);
      if (!capability) {
        throw taskVerificationError('task_verification_capability_undeclared', `Capability 未在当前 declaration 声明：${item.project}/${item.capability}。`, 400, { project: item.project, capability: item.capability });
      }
      if (capability.scope.services.length > 0 && !capability.scope.services.some((service) => task.record.scope.services.some((entry) => entry.project === item.project && entry.service === service))) {
        throw taskVerificationError('task_verification_capability_service_out_of_scope', `Capability 的 Service scope 不属于 Task：${item.project}/${item.capability}。`, 400, { project: item.project, capability: item.capability, services: capability.scope.services });
      }
    }
    for (const gap of coverageGaps) {
      if (gap.scope === 'workspace') throw taskVerificationError('task_verification_gap_scope_invalid', 'workspace coverage gap 只属于真正的仅工作区 Task。', 400, { scope: gap.scope });
      const projectMatch = gap.scope.match(/^project:([^/]+)$/);
      const serviceMatch = gap.scope.match(/^service:([^/]+)\/(.+)$/);
      const project = projectMatch?.[1] || serviceMatch?.[1];
      if (!project || !projects.has(project)) throw taskVerificationError('task_verification_gap_scope_invalid', `coverage gap scope 不属于 Task：${gap.scope}。`, 400, { scope: gap.scope });
      if (serviceMatch && !task.record.scope.services.some((item) => item.project === serviceMatch[1] && item.service === serviceMatch[2])) {
        throw taskVerificationError('task_verification_gap_scope_invalid', `coverage gap Service 不属于 Task：${gap.scope}。`, 400, { scope: gap.scope });
      }
    }
  }

  function recordTaskVerification(targetRoot, taskId, input) {
    assertFields(input, new Set(['targetIdentity', 'targetSummary', 'capabilities', 'coverageGaps', 'conclusion', 'declarationRoot']), 'Task Verification record');
    const task = runtime.prepareTaskRecordPersistence(targetRoot, taskId);
    if (task.record.status !== 'active') {
      throw taskVerificationError('task_verification_task_terminal', `Task ${taskId} 已是 ${task.record.status}，不能记录新的 Verification Result。`, 409, { status: task.record.status }, `运行 buildr task verification inspect ${taskId} 查看已有结果。`);
    }
    const observations = observeDeclarations(task, input.declarationRoot);
    const draft = normalizeTaskVerificationResult({
      schemaVersion: 'buildr.task-verification-result/v1',
      taskId: task.record.taskId,
      target: { identity: input.targetIdentity, summary: input.targetSummary },
      declarations: declarationValues(observations),
      capabilities: input.capabilities,
      coverageGaps: input.coverageGaps,
      conclusion: input.conclusion,
      completedAt: new Date().toISOString(),
    }, { expectedTaskId: task.record.taskId });
    validateRecordAgainstDeclarations(task, observations, draft.capabilities, draft.coverageGaps);
    const written = runtime.writeTaskVerificationResultPersistence(task.root, draft);
    const resultSlot = slot(task, draft.target.identity, draft.declarations);
    return operationResult('record', 'recorded', task.record.taskId, resultSlot, [{
      type: written.created ? 'created' : 'updated',
      path: relative(task.root, written.file),
    }]);
  }

  function generateTaskVerificationPrompt(targetRoot, input) {
    assertFields(input, new Set(['taskId', 'targetIdentity']), 'Task Verification prompt');
    const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : '';
    if (!taskId) throw taskVerificationError('task_verification_task_required', 'Task Verification prompt 必须提供 Task ID。');
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    if (task.record.status !== 'active') {
      throw taskVerificationError('task_verification_task_terminal', `Task ${taskId} 已是 ${task.record.status}，不能开始新的 Verification。`, 409, { status: task.record.status });
    }
    const targetIdentity = currentTarget(input.targetIdentity);
    return {
      prompt: [
        `请对正式 Task“${task.record.title}（${task.record.taskId}）”执行 Task Verification。`,
        '',
        `Task Intent：${task.record.intent}`,
        ...(targetIdentity ? [`已知 target identity：${targetIdentity}`] : ['先建立当前交付目标的明确、稳定 target identity；不要从 HEAD、时间或 Environment 伪造。']),
        '',
        '执行要求：',
        '1. 读取并遵循 task-verification Skill 与 selected buildr.task-verification/v3 contract；先 inspect Task 和 existing current Result。',
        '2. 按 Task ID 恢复 ready Task Environment，只在 receipt 允许的 execution roots 工作。',
        '3. 读取 Task scope 内 Project verification.yml v2，针对当前目标选择适用的已有 capabilities；没有能力只报告 coverage gap，不开发测试，并以只读 Declaration Intake 候选作为后续 next action。',
        '4. command runner 或 bounded Agent operation 产生的是 transient Execution Evidence；完整 stdout/stderr、耗时、资源与临时路径不得复制进 current Result。',
        '5. 只有全部适用执行与事实提炼完成后才通过 Task Verification Application record 一份完整 replacement；中断或结论不完整时不得覆盖 current。',
        '6. Result 只记录 target、declarations、实际 capabilities/facts、coverage gaps 与 passed|not-passed；是否 proceed/blocked 留给用户或未来 Task Development。',
        '7. 报告 Result digest、target/declaration applicability，并 cleanup 全部 transient execution evidence。',
      ].join('\n'),
      copiedMeansRecorded: false,
    };
  }

  Object.assign(runtime, {
    observeTaskVerificationDeclarations: (targetRoot, taskId, declarationRoot = undefined) => {
      const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
      return observeDeclarations(task, declarationRoot);
    },
    inspectTaskVerification,
    recordTaskVerification,
    generateTaskVerificationPrompt,
  });
  return runtime;
}
