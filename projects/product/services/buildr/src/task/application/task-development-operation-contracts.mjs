const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const RUNTIME_NOTE = '该 schema 只描述静态输入结构；Task、Environment、Change、identity 与专业 Result 的 current 约束仍由 Task Development Application 校验。';

const text = (description) => ({ type: 'string', minLength: 1, ...(description ? { description } : {}) });
const nullableText = (description) => ({ type: ['string', 'null'], ...(description ? { description } : {}) });
const array = (items, description) => ({ type: 'array', items, ...(description ? { description } : {}) });
const closed = (properties = {}, required = [], description = undefined) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
  ...(description ? { description } : {}),
});

const changeDisposition = closed({
  project: text('Task scope 中的 Project code。'),
  change: text('Task 已关联的 Change code。'),
  disposition: { type: 'string', enum: ['pending', 'converged', 'not-applicable'] },
  summary: text('当前 disposition 的最小摘要。'),
}, ['project', 'change', 'disposition', 'summary']);

const planningNode = closed({
  id: text('Planning node 的稳定 id。'),
  kind: text('专业 planning artifact 类型。'),
  authority: text('专业 authority identity。'),
  reference: nullableText('可移植引用；不允许本机绝对路径。'),
  identity: nullableText('Artifact 内容 identity；适用时使用 sha256 identity。'),
  disposition: { type: 'string', enum: ['pending', 'current', 'stale', 'not-applicable', 'waived'] },
  summary: text('Node 的最小摘要。'),
  source: nullableText('waiver 等 disposition 的授权来源。'),
}, ['id', 'kind', 'authority', 'disposition', 'summary']);

const planning = closed({
  targetIdentity: nullableText('当前 planning target identity。'),
  nodes: array(planningNode),
}, ['nodes']);

const planningGate = closed({
  disposition: { type: 'string', enum: ['waived', 'not-applicable'] },
  targetIdentity: nullableText('Gate 绑定的 planning target identity。'),
  summary: text('Disposition 摘要。'),
  source: text('明确授权或不适用事实来源。'),
}, ['disposition', 'summary', 'source']);

const formalPlan = closed({
  project: text('Task有效Project code。'),
  document: { type: 'object', description: 'closed buildr.verification-plan/v1或buildr.verification-plan-result/v1 document。' },
}, ['project', 'document']);

const capability = closed({
  project: text(),
  capability: text(),
  required: { type: 'boolean' },
}, ['project', 'capability', 'required']);

const coverageGap = closed({ scope: text('真正仅工作区Task使用workspace；其他Task使用project:<code>或service:<project>/<service>。'), summary: text() }, ['scope', 'summary']);
const override = closed({
  project: text(),
  capability: text(),
  required: { type: 'boolean' },
  scope: text(),
  basis: text(),
  source: text(),
}, ['project', 'capability', 'required', 'scope', 'basis', 'source']);

const knowledge = {
  treeIdentity: text('current Content Target identity。'),
  status: { type: 'string', enum: ['aligned', 'not-applicable', 'attention', 'blocked'] },
  summary: text(),
  sourceIdentities: array(text()),
  unresolvedItems: array(text()),
  projects: array(closed({
    project: text('Task有效Project code。'),
    status: { type: 'string', enum: ['aligned', 'not-applicable', 'attention', 'blocked'] },
    summary: text(),
    sourceIdentities: array(text()),
    unresolvedItems: array(text()),
  }, ['project', 'status', 'summary', 'sourceIdentities', 'unresolvedItems'])),
};

const risk = closed({
  gate: { type: 'string', enum: ['verification', 'completion'] },
  resultDigest: text('绑定的专业 Result sha256 digest。'),
  scope: text(),
  summary: text(),
  source: text('明确风险接受来源。'),
}, ['gate', 'resultDigest', 'scope', 'summary', 'source']);

const contributionSummary = closed({ contributionId: text(), summary: text() }, ['contributionId', 'summary']);
const supersededContribution = closed({
  contributionId: text(),
  deliveredByContributionId: text(),
  reason: text(),
}, ['contributionId', 'deliveredByContributionId', 'reason']);
const contributionHandoff = closed({
  schemaVersion: { type: 'string', const: 'buildr.contribution-handoff/v1' },
  identity: text('传入已规范化 handoff 时使用的 sha256 identity。'),
  parentTaskId: text(),
  planned: array(text()),
  delivered: array(text()),
  extra: array(contributionSummary),
  residual: array(contributionSummary),
  superseded: array(supersededContribution),
  affected: array(contributionSummary),
  nextAction: text(),
}, ['parentTaskId', 'planned', 'delivered', 'extra', 'residual', 'superseded', 'affected', 'nextAction']);

function inputSchema(properties = {}, required = [], description = RUNTIME_NOTE) {
  return { $schema: JSON_SCHEMA_DRAFT, ...closed(properties, required, description) };
}

const contracts = {
  inspect: {
    summary: '读取已保存的 current Development Receipt 与 applicability。',
    inputSchema: inputSchema(),
    example: {},
  },
  discover: {
    summary: '从 current Task、Environment、Receipt、declaration与可选Formal Plans生成observe/policy的closed mutation input；只读且不写入任何lifecycle fact。',
    inputSchema: inputSchema({
      action: { type: 'string', enum: ['observe', 'policy'], description: '需要生成输入的 Task Development mutation action。' },
      formalPlans: array(formalPlan, 'policy discovery可选的按有效Project完整覆盖的closed Formal Plan documents。'),
    }, ['action']),
    example: { action: 'observe' },
  },
  begin: {
    summary: '在首个正式研发动作前建立 Development Receipt 与 planning snapshot。',
    inputSchema: inputSchema({ changeDispositions: array(changeDisposition), planning, planningGate }, ['changeDispositions', 'planning']),
    example: { changeDispositions: [], planning: { targetIdentity: null, nodes: [] } },
  },
  planning: {
    summary: '在专业 planning artifacts 变化后刷新 planning snapshot。',
    inputSchema: inputSchema({ changeDispositions: array(changeDisposition), planning, planningGate }, ['changeDispositions', 'planning']),
    example: { changeDispositions: [], planning: { targetIdentity: null, nodes: [] } },
  },
  observe: {
    summary: '观察 ready Environment 中的稳定 Content Target。',
    inputSchema: inputSchema({
      changeDispositions: array(changeDisposition),
      planningTargetIdentity: nullableText('必须与 current planning target 一致。'),
    }, ['changeDispositions']),
    example: { changeDispositions: [], planningTargetIdentity: null },
  },
  policy: {
    summary: '记录与 current verification declarations 对齐的验证政策。',
    inputSchema: inputSchema({
      capabilities: array(capability),
      coverageGaps: array(coverageGap),
      overrides: array(override),
    }, ['capabilities', 'coverageGaps']),
    example: {
      capabilities: [{ project: '<project>', capability: '<capability>', required: true }],
      coverageGaps: [],
      overrides: [],
    },
  },
  knowledge: {
    summary: '保存selected Current Knowledge provider针对current Content Target的最小disposition。',
    inputSchema: inputSchema(knowledge, ['treeIdentity']),
    example: { treeIdentity: 'sha256-<content-target>', projects: [{ project: '<project>', status: 'aligned', summary: '<knowledge-summary>', sourceIdentities: [], unresolvedItems: [] }] },
  },
  gate: {
    summary: '记录 planning、verification 或 completion gate 的明确 waiver/not-applicable disposition。',
    inputSchema: inputSchema({
      gate: { type: 'string', enum: ['planning', 'verification', 'completion'] },
      disposition: { type: 'string', enum: ['waived', 'not-applicable'] },
      targetIdentity: nullableText(),
      summary: text(),
      source: text(),
    }, ['gate', 'disposition', 'summary', 'source']),
    example: { gate: 'planning', disposition: 'not-applicable', targetIdentity: null, summary: '<reason>', source: '<authority-source>' },
  },
  freeze: {
    summary: '在 Change、planning 与正式验证前置事实满足后冻结 current Candidate。',
    inputSchema: inputSchema({ planningTargetIdentity: nullableText() }),
    example: {},
  },
  decide: {
    summary: '针对 current Candidate 记录 proceed 或 blocked 决定。',
    inputSchema: inputSchema({
      outcome: { type: 'string', enum: ['proceed', 'blocked'] },
      summary: text(),
      risks: array(risk),
    }, ['outcome', 'summary', 'risks']),
    example: { outcome: 'blocked', summary: '<blocking-summary>', risks: [] },
  },
  handoff: {
    summary: '为 current Candidate 创建 immutable Finish handoff。',
    inputSchema: inputSchema({ contributionHandoff }),
    example: {},
  },
  carrier: {
    summary: '检查 Delivery Carrier 与 current handoff Candidate 的内容等价性。',
    inputSchema: inputSchema({
      handoffIdentity: text('Finish run冻结的Development handoff identity。'),
      candidateIdentity: text('Finish run冻结的Candidate identity。'),
      candidateGeneration: { type: 'integer', minimum: 1, description: 'Finish run冻结的Candidate generation。' },
      contentTargetIdentity: text('Finish run冻结的Content Target identity。'),
    }, ['handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity']),
    example: {
      handoffIdentity: 'sha256-<handoff>',
      candidateIdentity: 'sha256-<candidate>',
      candidateGeneration: 1,
      contentTargetIdentity: 'sha256-<content-target>',
    },
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

deepFreeze(contracts);

export const TASK_DEVELOPMENT_ACTIONS = Object.freeze(Object.keys(contracts));

export function taskDevelopmentActionContract(action) {
  return contracts[action] || null;
}

export function taskDevelopmentActionFields(action) {
  const contract = taskDevelopmentActionContract(action);
  if (!contract) throw new Error(`Unknown Task Development action contract: ${action}`);
  return new Set(Object.keys(contract.inputSchema.properties));
}

export function taskDevelopmentActionRequiredFields(action) {
  const contract = taskDevelopmentActionContract(action);
  if (!contract) throw new Error(`Unknown Task Development action contract: ${action}`);
  return new Set(contract.inputSchema.required || []);
}

export function taskDevelopmentDriverHelp(action = null) {
  if (action === null) {
    return {
      schemaVersion: 'buildr.task-development-driver-help/v1',
      action: null,
      usage: '<controller> __internal task-development <action> --task <task-id> --target <canonical-workspace> [--input-json <json>] [--compact | --profile]',
      discovery: ['--help', '<action> --help', '<action> --schema', '<action> --example'],
      actions: TASK_DEVELOPMENT_ACTIONS.map((name) => ({ action: name, summary: contracts[name].summary })),
    };
  }
  const contract = taskDevelopmentActionContract(action);
  if (!contract) return null;
  return {
    schemaVersion: 'buildr.task-development-driver-help/v1',
    action,
    summary: contract.summary,
    usage: `<controller> __internal task-development ${action} --task <task-id> --target <canonical-workspace> [--input-json <json>]${action === 'discover' ? ' [--plan <project>::<json-file> ...]' : ''} [--compact | --profile]`,
    discovery: [`${action} --schema`, `${action} --example`],
  };
}

export function taskDevelopmentDriverSchema(action) {
  const contract = taskDevelopmentActionContract(action);
  if (!contract) return null;
  return {
    schemaVersion: 'buildr.task-development-driver-schema/v1',
    action,
    inputOption: '--input-json',
    inputSchema: contract.inputSchema,
    runtimeValidation: RUNTIME_NOTE,
  };
}

export function taskDevelopmentDriverExample(action) {
  const contract = taskDevelopmentActionContract(action);
  if (!contract) return null;
  return {
    schemaVersion: 'buildr.task-development-driver-example/v1',
    action,
    inputJson: contract.example,
    note: RUNTIME_NOTE,
  };
}
