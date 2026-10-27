import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';

const text = { type: 'string', minLength: 1 };
const string = { type: 'string' };
const integer = { type: 'integer', minimum: 0 };
const boolean = { type: 'boolean' };
const permissionMode = { enum: ['default', 'full-access'] };
const closed = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const list = (items: unknown) => ({ type: 'array', items });
const named = (name: string, body: Record<string, unknown>) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://schemas.buildr.ai/http/agent-service/${name}/v1`, title: name, ...body });
const capabilities = closed({ text: boolean, images: boolean, approval: boolean, questions: boolean, stop: boolean, resume: boolean, maxInputBytes: integer, maxImageBytes: integer, permissionModes: list(permissionMode) }, ['text', 'images', 'approval', 'questions', 'stop', 'resume', 'maxInputBytes']);
const model = closed({ id: text, label: text, isDefault: boolean, reasoningEfforts: list(closed({ id: text, label: text })), defaultReasoningEffort: text }, ["id", "label"]);
const option = closed({ id: text, label: text });
const question = closed({ id: text, label: text, options: list(option), multiple: boolean }, ['id', 'label']);
const request = closed({ id: text, kind: { enum: ['approval', 'question'] }, title: text, description: string, options: list(option), questions: list(question), conversationId: text, workspaceId: text, participantId: text, runId: text, generation: text }, ['id', 'kind', 'title', 'conversationId', 'workspaceId', 'participantId', 'runId', 'generation']);
const handoffRound=closed({state:string,diagnostic:string,provider:string,model:string,executionCount:integer,artifactCount:integer,id:text,title:text,from:integer,through:integer,userInputs:list(string),assistantNotes:list(string),execution:list(closed({action:string,result:string,location:string},['action','result'])),artifacts:list(closed({location:string,description:string})),finalReply:string,sourcePath:string},['id','title','from','through','userInputs','assistantNotes','execution','artifacts']);
const handoff=closed({agent:string,model:string,changes:list(closed({kind:{enum:['agent','model']},label:string,before:string,after:string})),rounds:list(handoffRound),roundCount:integer,body:string,sourceThrough:integer,mode:{enum:['records','summary','indexed']},sourcePath:string},['agent','model','changes','rounds','body','sourceThrough','mode']);
const entry = closed({ handoff, id: text, sequence: integer, kind: { enum: ['message', 'tool', 'notice', 'handoff'] }, role: { enum: ['user', 'assistant', 'system'] }, text: string, name: text, input: string, participantId: text, provider: text, runId: text, status: { enum: ['sending', 'accepted', 'unknown', 'running', 'completed', 'failed'] }, attachments: list(text), createdAt: text }, ['id', 'sequence', 'kind', 'role', 'text', 'createdAt']);
const tool = closed({ id: text, label: text, status: { enum: ['running', 'completed', 'unknown'] }, canStop: boolean }, ['id', 'label', 'status']);
const run = closed({ interrupted: boolean, contextUsage:closed({usedTokens:integer,windowTokens:integer},['usedTokens']), id: text, participantId: text, provider: text, generation: text, status: { enum: ['starting', 'running', 'waiting-approval', 'waiting-question', 'stopping', 'stopped', 'tools-active', 'unknown', 'completed', 'failed'] }, accepted: boolean, tools: list(tool), model: text, modelAccountId: text, modelAccountIdentity: text, modelAccountRevision: text, modelSourceLabel: text, reasoningEffort: text, serviceTier: text, permissionMode, diagnostic: string, startedAt: text, updatedAt: text }, ['id', 'participantId', 'provider', 'generation', 'status', 'accepted', 'tools', 'startedAt', 'updatedAt']);
const participant = closed({ id: text, provider: text, connectionId: text, label: text, deliveredThrough: integer, contextId: string });
const conversation = closed({ id: text, workspaceId: text, cwd: text, taskId: text, title: text, revision: text, hidden: boolean, updatedAt: text, participants: list(participant), entries: list(entry), run, requests: list(request), nextEntryCursor: integer }, ['id', 'workspaceId', 'cwd', 'title', 'revision', 'hidden', 'updatedAt', 'participants', 'entries', 'requests']);
const connection = closed({ id: text, provider: text, label: text, revision: text, status: { enum: ['disconnected', 'connecting', 'not-authenticated', 'ready', 'expired', 'failed'] }, enabled: boolean, executable: text, configPath: text, account: closed({ label: string, loginMethod: string }, []), diagnostic: string, models: list(model), capabilities, loginAttempt: closed({ id: text, generation: text, state: { enum: ['initializing', 'waiting-browser', 'checking', 'completed', 'cancelled', 'expired', 'failed'] }, updatedAt: text, url: string, diagnostic: string }, ['id', 'generation', 'state', 'updatedAt']) }, ['id', 'provider', 'label', 'revision', 'status', 'enabled', 'models', 'capabilities']);
const draftFields = { skipHandoffSummary:boolean, expectedRevision: text, connectionId: text, text: { type: 'string', maxLength: 65536 }, model: text, modelAccountId: text, modelAccountIdentity: text, modelAccountRevision: text, modelSourceLabel: text, reasoningEffort: text, serviceTier: text, permissionMode, attachmentIds: { type: 'array', maxItems: 4, items: text }, handoffSummary: text };
const controlFields = { expectedRevision: text, runId: text, participantId: text, generation: text };
const programCandidate = closed({ executable: text, source: { enum: ['configured', 'selected', 'path', 'managed', 'application', 'sdk'] }, label: text, version: text, compatible: boolean, diagnostic: string }, ['executable', 'source', 'label', 'compatible']);
const programCatalog = closed({ candidates: list(programCandidate), installation: closed({ label: text, version: text, url: text, canInstall: boolean, diagnostic: string }, ['label', 'version', 'url', 'canInstall']) });
const preparation = closed({ id: text, connectionId: text, generation: text, state: { enum: ['discovering', 'selection-required', 'installation-required', 'installing', 'connecting', 'waiting-login', 'ready', 'failed', 'cancelled'] }, message: text, updatedAt: text, catalog: programCatalog, connection }, ['id', 'connectionId', 'generation', 'state', 'message', 'updatedAt', 'connection']);

const serviceTier=closed({id:text,label:text,contextWindow:integer,reasoningEfforts:list(closed({id:text,label:text})),defaultReasoningEffort:text},['id','label']);
const offering = closed({kind:{enum:['model','combination']},family:text,enabled:boolean,reportedContextWindow:integer,contextWindowOverride:integer,defaultServiceTier:text,serviceTiers:list(serviceTier), id: text, label: text, contextWindow: integer, maxOutputTokens: integer, images: boolean, tools: boolean, reasoningEfforts: list(closed({id: text, label: text})), defaultReasoningEffort: text }, ['id','label','images','tools']);
const quota = closed({stale:boolean,diagnostic:text,planLabel:text,windows:list(closed({id:text,label:text,remainingPercent:{type:'number',minimum:0,maximum:100},resetsAt:text,limitWindowSeconds:integer},['id','label','remainingPercent'])), observedAt: text, available: boolean, summary: text, remainingPercent: {type:'number',minimum:0,maximum:100}, resetsAt: text }, ['observedAt','available']);
const modelAccount = closed({connectionId:text,id: text, identity: text, provider: text, label: text, revision: text, enabled: boolean, status: {enum:['not-authenticated','ready','expired','failed','disconnected']}, accountLabel: text, models: list(offering), observedAt: text, quota, diagnostic: text, loginAttempt: closed({id: text, state: {enum:['initializing','waiting-browser','checking','completed','cancelled','expired','failed']},updatedAt:text,url:string,diagnostic:string},['id','state','updatedAt'])},['id','provider','label','revision','enabled','status','models']);
const catalogModel = {...offering, properties: {...offering.properties, accountId:text,accountIdentity:text,provider:text,accountLabel:text,modelId:text,accountRevision:text,available:boolean,observedAt:text}, required:[...offering.required,'accountId','accountIdentity','provider','accountLabel','modelId','accountRevision','available']};
export const AGENT_SERVICE_HTTP_SCHEMAS = {
  modelPreferences: named('AgentModelPreferences',closed({expectedRevision:text,models:{type:'array',minItems:1,maxItems:2000,items:closed({id:text,enabled:boolean,contextWindow:{anyOf:[{type:'integer',minimum:1,maximum:10000000},{type:'null'}]}},['id'])}})),
  modelAccount: named('AgentModelAccount', modelAccount),
  modelAccounts: named('AgentModelAccounts', closed({accounts:list(modelAccount),providers:list(closed({id:text,label:text}))})),
  modelCatalog: named('AgentModelCatalog', closed({models:list(catalogModel)})),
  addModelAccount: named('AgentModelAccountAdd', closed({provider:text,label:text},['provider'])),
  empty: named('AgentServiceEmptyRequest', closed({})),
  connection: named('AgentServiceConnection', connection),
  connections: named('AgentServiceConnections', closed({ connections: list(connection) })),
  prepare: named('AgentServicePrepareRequest', closed({ expectedRevision: text, executable: { type: 'string', minLength: 1, maxLength: 4096 }, install: boolean }, ['expectedRevision'])),
  preparation: named('AgentServicePreparation', preparation),
  currentPreparation: named('AgentServiceCurrentPreparation', closed({ attempt: { anyOf: [preparation, { type: 'null' }] } })),
  connect: named('AgentServiceConnectRequest', closed({ expectedRevision: text, executable: text }, ['expectedRevision'])),
  revision: named('AgentServiceRevisionRequest', closed({ expectedRevision: text })),
  check: named('AgentServiceCheckRequest', closed({ expectedRevision: text }, [])),
  defaultWorkspace: named('AgentDefaultWorkspace', closed({ rootPath: text })),
  conversations: named('AgentConversationsPage', closed({ conversations: list(conversation), nextCursor: text }, ['conversations'])),
  conversation: named('AgentConversation', conversation),
  create: named('AgentConversationCreateRequest', closed({ cwd: text, taskId: text, title: text }, [])),
  update: named('AgentConversationUpdateRequest', closed({ expectedRevision: text, title: text, hidden: boolean }, ['expectedRevision'])),
  draft: named('AgentConversationDraftRequest', closed(draftFields, ['expectedRevision', 'connectionId', 'text'])),
  send: named('AgentConversationSendRequest', closed({ ...draftFields, previewToken: text, clientRequestId: text }, ['expectedRevision', 'connectionId', 'text', 'previewToken', 'clientRequestId'])),
  sent: named('AgentConversationSendResult', closed({ run, conversation })),
  stop: named('AgentConversationStopRequest', closed({ ...controlFields, toolId: text }, Object.keys(controlFields))),
  reply: named('AgentConversationReplyRequest', closed({ ...controlFields, answer: {} })),
  preview: named('AgentConversationSendPreview', closed({ handoff, token: text, conversationId: text, revision: text, connectionId: text, model: text, modelAccountId: text, modelAccountIdentity: text, modelAccountRevision: text, modelSourceLabel: text, reasoningEffort: text, serviceTier: text, permissionMode, participantId: text, cwd: text, taskId: text, text: string, history: list(closed({ sequence: integer, role: string, provider: text, text: string }, ['sequence', 'role', 'text'])), sourceThrough: integer, inputBytes: integer, maxInputBytes: integer, fits: boolean, switching: boolean, diagnostic: string }, ['token', 'conversationId', 'revision', 'connectionId', 'permissionMode', 'cwd', 'text', 'history', 'sourceThrough', 'inputBytes', 'maxInputBytes', 'fits', 'switching'])),
  attachment: named('AgentConversationAttachmentRequest', closed({ expectedRevision: text, mimeType: { enum: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] } })),
  attachmentResult: named('AgentConversationAttachmentResult', closed({ id: text, mimeType: text, size: integer, revision: text })),
  event: named('AgentConversationEvent', closed({ cursor: integer, generation: text, type: { enum: ['snapshot', 'conversation', 'connection'] }, workspaceId: text, conversationId: text, revision: text, payload: closed({ conversation, connection }, []) }, ['cursor', 'generation', 'type', 'revision', 'payload'])),
};
export const AGENT_SERVICE_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(AGENT_SERVICE_HTTP_SCHEMAS));

const base = '/api/v1/app/agent-service';
const workspace = '/api/v1/workspaces/:workspaceId/agent-conversations';
const operation = (id: string, method: string, path: string, input: keyof typeof AGENT_SERVICE_HTTP_SCHEMAS, output: keyof typeof AGENT_SERVICE_HTTP_SCHEMAS, responseKind = 'json') => ({ id: `agent-service.${id}`, owner: 'agent-service', method, path, disposition: responseKind === 'json' ? 'migrated-json' : responseKind === 'binary' ? 'migrated-binary' : 'migrated-stream', responseKind, requestSchemaId: AGENT_SERVICE_HTTP_SCHEMAS[input].$id, successSchemaId: responseKind === 'binary' ? null : AGENT_SERVICE_HTTP_SCHEMAS[output].$id, errorSchemaId: 'https://schemas.buildr.ai/http/local-app/error/response/v1' });
export const AGENT_SERVICE_HTTP_OPERATIONS = [
  operation('model-accounts', 'GET', `${base}/model-accounts`, 'empty', 'modelAccounts'),
  operation('add-model-account', 'POST', `${base}/model-accounts`, 'addModelAccount', 'modelAccount'),
  operation('model-account', 'GET', `${base}/model-accounts/:accountId`, 'empty', 'modelAccount'),
  operation('model-catalog', 'GET', `${base}/model-catalog`, 'empty', 'modelCatalog'),
  operation('model-preferences','POST',`${base}/model-accounts/:accountId/preferences`,'modelPreferences','modelAccount'),
  operation('check-model-account', 'POST', `${base}/model-accounts/:accountId/check`, 'revision', 'modelAccount'),
  operation('disconnect-model-account', 'POST', `${base}/model-accounts/:accountId/disconnect`, 'revision', 'modelAccount'),
  operation('login-model-account', 'POST', `${base}/model-accounts/:accountId/login-attempts`, 'revision', 'modelAccount'),
  operation('model-login-attempt', 'GET', `${base}/model-accounts/:accountId/login-attempts/:attemptId`, 'empty', 'modelAccount'),
  operation('cancel-model-login', 'POST', `${base}/model-accounts/:accountId/login-attempts/:attemptId/cancel`, 'revision', 'modelAccount'),
  operation('connections', 'GET', `${base}/connections`, 'empty', 'connections'),
  operation('connection', 'GET', `${base}/connections/:connectionId`, 'empty', 'connection'),
  operation('prepare', 'POST', `${base}/connections/:connectionId/preparation-attempts`, 'prepare', 'preparation'),
  operation('preparation', 'GET', `${base}/connections/:connectionId/preparation-attempts/:attemptId`, 'empty', 'preparation'),
  operation('current-preparation', 'GET', `${base}/connections/:connectionId/preparation-attempts`, 'empty', 'currentPreparation'),
  operation('cancel-preparation', 'POST', `${base}/connections/:connectionId/preparation-attempts/:attemptId/cancel`, 'empty', 'preparation'),
  operation('connect', 'POST', `${base}/connections/:connectionId/connect`, 'connect', 'connection'),
  operation('check', 'POST', `${base}/connections/:connectionId/check`, 'check', 'connection'),
  operation('disconnect', 'POST', `${base}/connections/:connectionId/disconnect`, 'revision', 'connection'),
  operation('login', 'POST', `${base}/connections/:connectionId/login-attempts`, 'revision', 'connection'),
  operation('login-attempt', 'GET', `${base}/connections/:connectionId/login-attempts/:attemptId`, 'empty', 'connection'),
  operation('cancel-login', 'POST', `${base}/connections/:connectionId/login-attempts/:attemptId/cancel`, 'revision', 'connection'),
  operation('default-workspace', 'GET', `${base}/default-workspace`, 'empty', 'defaultWorkspace'),
  operation('pending', 'GET', `${base}/pending-requests`, 'empty', 'conversations'),
  operation('list', 'GET', workspace, 'empty', 'conversations'),
  operation('create', 'POST', workspace, 'create', 'conversation'),
  operation('read', 'GET', `${workspace}/:conversationId`, 'empty', 'conversation'),
  operation('update', 'PATCH', `${workspace}/:conversationId`, 'update', 'conversation'),
  operation('entries', 'GET', `${workspace}/:conversationId/entries`, 'empty', 'conversation'),
  operation('prepare-send', 'POST', `${workspace}/:conversationId/prepare-send`, 'draft', 'preview'),
  operation('send', 'POST', `${workspace}/:conversationId/send`, 'send', 'sent'),
  operation('generate-title', 'POST', `${workspace}/:conversationId/generate-title`, 'revision', 'conversation'),
  operation('observe', 'POST', `${workspace}/:conversationId/observe`, 'empty', 'conversation'),
  operation('stop', 'POST', `${workspace}/:conversationId/stop`, 'stop', 'conversation'),
  operation('reply', 'POST', `${workspace}/:conversationId/requests/:requestId/reply`, 'reply', 'conversation'),
  operation('attachment', 'POST', `${workspace}/:conversationId/attachments`, 'attachment', 'attachmentResult'),
  operation('image', 'GET', `${workspace}/:conversationId/attachments/:attachmentId`, 'empty', 'attachmentResult', 'binary'),
  operation('events', 'GET', `${workspace}/:conversationId/events`, 'empty', 'event', 'stream'),
].flatMap(item => item.path.startsWith(workspace)
  ? [item, { ...item, id: item.id + '.default', path: item.path.replace(workspace, `${base}/conversations`) }]
  : [item]);
