import crypto from 'node:crypto';

export const TASK_PLANNING_IDENTITY_RESULT_SCHEMA = 'buildr.task-planning-identity-result/v1';
export const TASK_PLANNING_IDENTITY_AUTHORITY = 'buildr.task-planning-identity/v1';
export const TASK_PLANNING_IGNORED_FACTS = Object.freeze([
  'artifact-path',
  'change-lifecycle-provenance',
  'checklist-completion',
  'filesystem-time',
  'brief-and-workflow-sidecar',
  'git-environment-review-verification-facts',
]);

const REQUIRED_SECTIONS = Object.freeze({
  proposal: ['Why', 'What Changes', 'Capabilities', 'Impact'],
  design: ['Context', 'Goals / Non-Goals', 'Decisions', 'Risks / Trade-offs'],
});

export function taskPlanningIdentityError(code, message, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  if (nextAction !== undefined) error.nextAction = nextAction;
  error.taskPlanningIdentityBusiness = true;
  return error;
}

export function taskPlanningIdentityDigest(value) {
  const content = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value);
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw taskPlanningIdentityError('task_planning_identity_field_invalid', `${field} 必须是非空字符串。`, { field });
  }
  return value.trim();
}

function list(value, field) {
  if (!Array.isArray(value)) throw taskPlanningIdentityError('task_planning_identity_field_invalid', `${field} 必须是数组。`, { field });
  return value;
}

function normalizeLines(value, { tasks = false } = {}) {
  let normalized = value
    .replace(/\r\n?/gu, '\n')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/gu, ''))
    .join('\n');
  if (tasks) normalized = normalized.replace(/^(\s*-\s*)\[[ xX]\](\s+)/gmu, '$1[ ]$2');
  return `${normalized.replace(/\n{3,}/gu, '\n\n').trim()}\n`;
}

function sectionNames(content) {
  return [...content.matchAll(/^##\s+(.+?)\s*$/gmu)].map((match) => match[1]);
}

function assertSections(content, kind, field) {
  const sections = new Set(sectionNames(content));
  for (const required of REQUIRED_SECTIONS[kind] || []) {
    if (!sections.has(required)) {
      throw taskPlanningIdentityError(
        'task_planning_identity_structure_unsupported',
        `${field} 缺少受支持的章节（section）：${required}。`,
        { field, kind, required },
        '补全当前OpenSpec规划产物（planning artifact）结构后重新解析；不要回退到原始摘要（raw digest）或旧审查目标（Review target）。',
      );
    }
  }
}

function assertTasks(content, field) {
  if (!/^\s*-\s*\[[ xX]\]\s+\S/gmu.test(content)) {
    throw taskPlanningIdentityError(
      'task_planning_identity_structure_unsupported',
      `${field} 没有可识别的OpenSpec任务项（task item）。`,
      { field, kind: 'tasks' },
      '使用OpenSpec复选框任务（checkbox task）格式后重新解析；不要回退到原始摘要（raw digest）或旧审查目标（Review target）。',
    );
  }
}

function assertSpec(content, field) {
  const requirements = [...content.matchAll(/^### Requirement:\s+(.+?)\s*$/gmu)];
  if (requirements.length === 0) {
    throw taskPlanningIdentityError(
      'task_planning_identity_structure_unsupported',
      `${field} 没有完整的Requirement/Scenario WHEN/THEN结构。`,
      { field, kind: 'spec' },
      '先通过OpenSpec严格校验（strict validation）并补全需求/场景（Requirement/Scenario）结构后重新解析。',
    );
  }
  for (const [index, requirement] of requirements.entries()) {
    const start = requirement.index;
    const end = requirements[index + 1]?.index ?? content.length;
    const requirementContent = content.slice(start, end);
    const scenarios = [...requirementContent.matchAll(/^#### Scenario:\s+(.+?)\s*$/gmu)];
    if (scenarios.length === 0) {
      throw taskPlanningIdentityError(
        'task_planning_identity_structure_unsupported',
        `${field} 的Requirement缺少Scenario：${requirement[1]}。`,
        { field, kind: 'spec', requirement: requirement[1] },
        '补全每个Requirement的Scenario后重新解析。',
      );
    }
    for (const [scenarioIndex, scenario] of scenarios.entries()) {
      const scenarioStart = scenario.index;
      const scenarioEnd = scenarios[scenarioIndex + 1]?.index ?? requirementContent.length;
      const scenarioContent = requirementContent.slice(scenarioStart, scenarioEnd);
      if (!/^- \*\*WHEN\*\*\s+.+$/gmu.test(scenarioContent) || !/^- \*\*THEN\*\*\s+.+$/gmu.test(scenarioContent)) {
        throw taskPlanningIdentityError(
          'task_planning_identity_structure_unsupported',
          `${field} 的Scenario缺少WHEN或THEN：${scenario[1]}。`,
          { field, kind: 'spec', requirement: requirement[1], scenario: scenario[1] },
          '补全每个Scenario的WHEN与THEN后重新解析。',
        );
      }
    }
  }
}

export function normalizeTaskPlanningMarkdown(value, { kind, field = kind } = {}) {
  const original = text(value, field);
  const normalized = normalizeLines(original, { tasks: kind === 'tasks' });
  if (kind === 'proposal' || kind === 'design') assertSections(normalized, kind, field);
  else if (kind === 'tasks') assertTasks(original, field);
  else if (kind === 'spec') assertSpec(normalized, field);
  else throw taskPlanningIdentityError('task_planning_identity_kind_unsupported', `不支持的规划产物类型（planning artifact kind）：${kind}。`, { field, kind });
  return normalized;
}

function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) throw taskPlanningIdentityError('task_planning_identity_field_invalid', 'task.scope 必须是对象。', { field: 'task.scope' });
  const projects = list(scope.projects, 'task.scope.projects').map((value, index) => text(value, `task.scope.projects[${index}]`)).sort((left, right) => left.localeCompare(right));
  const services = list(scope.services, 'task.scope.services').map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw taskPlanningIdentityError('task_planning_identity_field_invalid', `task.scope.services[${index}] 必须是对象。`, { field: `task.scope.services[${index}]` });
    return { project: text(value.project, `task.scope.services[${index}].project`), service: text(value.service, `task.scope.services[${index}].service`) };
  }).sort((left, right) => `${left.project}/${left.service}`.localeCompare(`${right.project}/${right.service}`));
  return { projects, services };
}

function artifact(id, kind, content, logicalReference, summary) {
  const normalized = normalizeTaskPlanningMarkdown(content, { kind, field: logicalReference });
  return { id, kind, identity: taskPlanningIdentityDigest(normalized), logicalReference, summary };
}

function normalizeChange(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw taskPlanningIdentityError('task_planning_identity_field_invalid', `changes[${index}] 必须是对象。`, { field: `changes[${index}]` });
  const project = text(value.project, `changes[${index}].project`);
  const change = text(value.change, `changes[${index}].change`);
  const prefix = `openspec:${project}/${change}`;
  const specs = list(value.specs, `changes[${index}].specs`);
  if (specs.length === 0) {
    throw taskPlanningIdentityError(
      'task_planning_identity_artifact_missing',
      `OpenSpec变更（Change）缺少增量规范（delta spec）：${project}/${change}。`,
      { project, change, artifact: 'specs' },
      '补全应用所需的增量规范（apply-required delta specs）并通过严格校验（strict validation）后重新解析。',
    );
  }
  const artifacts = [
    artifact('proposal', 'proposal', value.proposal, `${prefix}#proposal`, 'OpenSpec proposal当前计划语义。'),
    artifact('design', 'design', value.design, `${prefix}#design`, 'OpenSpec design当前计划语义。'),
    artifact('tasks', 'tasks', value.tasks, `${prefix}#tasks`, 'OpenSpec tasks当前计划语义。'),
    ...specs.map((spec, specIndex) => {
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw taskPlanningIdentityError('task_planning_identity_field_invalid', `changes[${index}].specs[${specIndex}] 必须是对象。`, { field: `changes[${index}].specs[${specIndex}]` });
      const capability = text(spec.capability, `changes[${index}].specs[${specIndex}].capability`);
      return artifact(`spec:${capability}`, 'spec', spec.content, `${prefix}#spec:${capability}`, `OpenSpec ${capability} delta spec当前计划语义。`);
    }),
  ].sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(artifacts.map((item) => item.id)).size !== artifacts.length) throw taskPlanningIdentityError('task_planning_identity_artifact_duplicate', `OpenSpec变更（Change）包含重复规划产物（artifact）：${project}/${change}。`, { project, change });
  return { project, change, artifacts };
}

export function createTaskPlanningIdentity({ task, changes }) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw taskPlanningIdentityError('task_planning_identity_field_invalid', 'task 必须是对象。', { field: 'task' });
  const normalizedTask = { intent: text(task.intent, 'task.intent'), scope: normalizeScope(task.scope) };
  const normalizedChanges = list(changes, 'changes').map(normalizeChange).sort((left, right) => `${left.project}/${left.change}`.localeCompare(`${right.project}/${right.change}`));
  if (normalizedChanges.length === 0) {
    throw taskPlanningIdentityError(
      'task_planning_identity_change_missing',
      '任务（Task）没有关联可解析的OpenSpec变更（Change）。',
      { changes: [] },
      '为正式任务（Task）关联应用就绪（apply-ready）的OpenSpec变更（Change）后重新解析；仅代码（code-only）或自定义规划（planning）使用其专业权威（authority）建立目标（target）。',
    );
  }
  const keys = normalizedChanges.map((item) => `${item.project}/${item.change}`);
  if (new Set(keys).size !== keys.length) throw taskPlanningIdentityError('task_planning_identity_change_duplicate', '任务（Task）包含重复OpenSpec变更（Change）。', { keys });
  const projection = {
    task: normalizedTask,
    changes: normalizedChanges.map(({ project, change, artifacts }) => ({
      project,
      change,
      artifacts: artifacts.map(({ id, kind, identity }) => ({ id, kind, identity })),
    })),
  };
  const planningNodes = normalizedChanges.flatMap(({ project, change, artifacts }) => artifacts.map((item) => ({
    id: `openspec:${project}/${change}:${item.id}`,
    kind: item.kind,
    authority: TASK_PLANNING_IDENTITY_AUTHORITY,
    reference: item.logicalReference,
    identity: item.identity,
    disposition: 'current',
    summary: item.summary,
    source: null,
  }))).sort((left, right) => left.id.localeCompare(right.id));
  const identity = taskPlanningIdentityDigest(projection);
  return {
    target: { identity, summary: `${normalizedChanges.length}个OpenSpec变更（Change）的当前任务（Task）计划语义。` },
    projection,
    planningNodes,
    ignoredFacts: [...TASK_PLANNING_IGNORED_FACTS],
  };
}
