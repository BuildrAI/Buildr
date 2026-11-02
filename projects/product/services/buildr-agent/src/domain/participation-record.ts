import { createHash } from 'node:crypto';
import type { StoredConversation } from './agent-state.ts';
import { conversationRuns, fail } from './agent-state.ts';
import { normalizeParticipation, participationSource } from './participation.ts';
import type { ParticipationFact, ParticipationSummary, ParticipationSummaryInput, ParticipationSummaryRow, ParticipationView } from '../participation-contracts.ts';

export interface ParticipationProjection {
  version?:1;
  parserVersion?:1;
  revision: string;
  runs: Array<{id: string; startedAt: string; collected: boolean; provider?:string; model?:string}>;
  facts: ParticipationFact[];
  gaps: string[];
}
export function projectParticipation(record: StoredConversation): ParticipationProjection {
  const facts: ParticipationFact[] = [], gaps = new Set<string>(), runs: ParticipationProjection['runs'] = [];
  const entryById=new Map(record.view.entries.map(entry=>[entry.id,entry]));
  const toolsByRun=new Map<string,typeof record.view.entries>();
  for(const entry of record.view.entries)if(entry.kind==='tool'&&entry.runId){const tools=toolsByRun.get(entry.runId)??[];tools.push(entry);toolsByRun.set(entry.runId,tools);}
  const runById=new Map(conversationRuns(record.view).map(run=>[run.id,run]));
  for (const attempt of record.attempts) {
    if (attempt.supplement) continue;
    const run = runById.get(attempt.runId) ?? record.runOutcomes?.[attempt.runId];
    const startedAt = entryById.get(attempt.userEntryId)?.createdAt;
    if (!startedAt) { gaps.add('run-time-unavailable'); continue; }
    const base = { conversationId: record.view.id, runId: attempt.runId, participantId: attempt.participantId, generation: run?.generation, provider: run?.provider, model: run?.model, startedAt };
    const input = attempt.participation;
    const tools = toolsByRun.get(attempt.runId)??[];
    const collected = !!input || tools.some(e => !!record.participationTools?.[e.id]||!!e.participation);
    runs.push({id: attempt.runId, startedAt, collected,provider:base.provider,model:base.model});
    if (!collected) gaps.add('historical-not-collected');
    if (input) {
      input.gaps.forEach(g => gaps.add(g));
      for (const match of input.segments) facts.push({ ...match, ...base, evidence: {inputId: attempt.clientRequestId}, outcome: attempt.accepted ? 'succeeded' : 'unknown' });
      for (const source of input.available) facts.push({ ...participationSource(source), action: 'available', ...base, evidence: {inputId: attempt.clientRequestId}, outcome: 'unknown' });
    }
    const requests=new Map<string,Set<string>>();
    for (const entry of tools) {
      const attachment=record.participationTools?.[entry.id];
      const entryRevision=createHash('sha256').update(JSON.stringify(entry)).digest('hex');
      if(attachment?.entryRevision&&attachment.entryRevision!==entryRevision){gaps.add('tool-observation-stale');continue;}
      const observed = normalizeParticipation(record.participationTools?.[entry.id]??entry.participation);
      if (!observed) { gaps.add('tool-not-collected'); continue; }
      observed.gaps.forEach(g => gaps.add(g));
      if (observed.coverage === 'partial') gaps.add('partial-tool-observation');
      // A single tool may mention multiple actions: never divide its mixed output.
      for (const match of observed.matches) {
        let repeated:boolean|undefined;
        if(match.action==='requested'&&entry.input!==undefined&&observed.input?.completeness==='complete'&&Buffer.byteLength(entry.input)===observed.input.utf8Bytes){
          const key=JSON.stringify([match.identity,match.action]);const prior=requests.get(key)??new Set<string>();repeated=prior.has(entry.input);prior.add(entry.input);requests.set(key,prior);
        }
        facts.push({ ...match, ...base,...(repeated===undefined?{}:{repeated}), evidence: {entryId: entry.id,entryRevision}, outcome: observed.outcome,
        ...(observed.matches.length === 1 && match.contentScope!=='fragment' ? { input: match.input ?? observed.input, output: match.output ?? observed.output } : {}) });
      }
    }
  }
  if (Buffer.byteLength(JSON.stringify(facts)) > 1024 * 1024) {
    let size = 0; const bounded: ParticipationFact[] = [];
    for (const fact of facts) { size += Buffer.byteLength(JSON.stringify(fact)); if (size > 900 * 1024) break; bounded.push(fact); }
    return {version:1,parserVersion:1,revision: record.view.revision, runs, facts: bounded, gaps: [...gaps, 'projection-limit']};
  }
  return {version:1,parserVersion:1,revision: record.view.revision, runs, facts, gaps: [...gaps]};
}
export function singleParticipation(record: StoredConversation, runId: string): ParticipationView {
  if (!record.attempts.some(a => a.runId === runId)) fail('agent_run_missing', '本对话没有该执行。', 404);
  const projection = projectParticipation({ ...record, attempts: record.attempts.filter(a => a.runId === runId) }), run = projection.runs.find(r => r.id === runId);
  const originalRun=conversationRuns(record.view).find(value=>value.id===runId)??record.runOutcomes?.[runId];
  return {...(originalRun?.contextUsage?{contextUsage:originalRun.contextUsage}:{}),...(originalRun?.status?{runStatus:originalRun.status}:{}),schemaVersion: 'buildr.agent-participation/v1', workspaceId: record.view.workspaceId, conversationId: record.view.id, runId,
    revision: record.view.revision, contextConfiguration: record.attempts.find(a=>a.runId===runId)?.participation?.context ? record.attempts.find(a=>a.runId===runId)!.participation!.context!.inherited?'inherited':'new':'unknown', coverage: !run?.collected ? 'not-collected' : projection.gaps.length ? 'partial' : 'complete',
    gaps: projection.gaps, items: projection.facts.filter(f => f.runId === runId)};
}
export function summarizeParticipation(workspaceId: string, projections: ParticipationProjection[], input: ParticipationSummaryInput, now: string, incomplete = false): ParticipationSummary {
  const allowed = ['from', 'to', 'provider', 'model', 'kind', 'identity', 'version', 'cursor', 'limit'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) fail('agent_participation_query_invalid', '参与查询字段无效。');
  const to = input.to ?? now;
  if (typeof to !== 'string' || !Number.isFinite(Date.parse(to))) fail('agent_participation_range_invalid', '查询结束时间无效。');
  const from = input.from ?? new Date(Date.parse(to) - 7 * 86400000).toISOString();
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 90 * 86400000) fail('agent_participation_range_invalid', '查询范围必须是有效的至多90天半开区间。');
  if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 200)) fail('agent_participation_limit_invalid', '每页必须为1至200行。');
  for (const key of ['provider', 'model', 'kind', 'identity', 'version', 'cursor'] as const) if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key]!.length > 4096)) fail('agent_participation_query_invalid', '筛选字段无效。');
  const range = {from: new Date(from).toISOString(), to: new Date(to).toISOString()};
  const inRange = (at: string) => at >= range.from && at < range.to;
  const filtered = projections.flatMap(p => p.facts).filter(f => inRange(f.startedAt) && (!input.provider || f.provider === input.provider) && (!input.model || f.model === input.model) && (!input.kind || f.kind === input.kind) && (!input.identity || f.identity === input.identity) && (!input.version || (f.observedVersion ?? f.offeredVersion) === input.version));
  const rows = new Map<string, ParticipationSummaryRow & {runIds: Set<string>; availableIds: Set<string>; requestedIds:Set<string>}>();
  const seen=new Set<string>();
  for (const fact of filtered) {
    const factKey=JSON.stringify([fact.conversationId,fact.runId,fact.evidence.entryId??fact.evidence.inputId,fact.identity,fact.action]);
    if(seen.has(factKey))continue;seen.add(factKey);
    const version = fact.observedVersion ?? fact.offeredVersion ?? null;
    const versionBasis = fact.observedVersion ? 'observed' as const : fact.offeredVersion ? 'offered' as const : 'unknown' as const;
    const key = JSON.stringify([fact.providedBy, fact.managedBy, fact.identity, version, versionBasis, fact.status]);
    let row = rows.get(key);
    if (!row) { row = {identity: fact.identity, name: fact.name, kind: fact.kind, providedBy: fact.providedBy, managedBy:fact.managedBy??null, status: fact.status, version, versionBasis, runs: 0, availableRuns: 0, requestedAvailableRuns:0, observableUseRatio:null, submitted: 0, requested: 0, observed: 0, succeeded: 0, failed: 0, pending: 0, unknown: 0, failureRatio: null, repeatedRequests:null, inputBytes: 0, outputBytes: 0, partialMeasures: 0, unknownMeasures: 0, evidence: [], runIds: new Set(), availableIds: new Set(), requestedIds:new Set()}; rows.set(key, row); }
    const runKey = fact.conversationId + ':' + fact.runId;
    row.runIds.add(runKey);
    if (fact.action === 'available') {row.availableIds.add(runKey); continue;}
    if(fact.action==='requested'||fact.action==='observed')row.requestedIds.add(runKey);
    row[fact.action]++;
    if(fact.repeated!==undefined)row.repeatedRequests=(row.repeatedRequests??0)+(fact.repeated?1:0);
    row[fact.outcome]++;
    if (fact.input?.completeness === 'complete') row.inputBytes += fact.input.utf8Bytes;
    else if (fact.input) row.partialMeasures++;
    else row.unknownMeasures++;
    if (fact.output?.completeness === 'complete') row.outputBytes += fact.output.utf8Bytes;
    else if (fact.output) row.partialMeasures++;
    else if (fact.action !== 'submitted') row.unknownMeasures++;
    if (row.evidence.length < 5) row.evidence.push({conversationId: fact.conversationId, runId: fact.runId, ...fact.evidence});
  }
  const resultRows = [...rows.values()].map(({runIds, availableIds, requestedIds, ...row}) => ({...row, runs: runIds.size, availableRuns: availableIds.size, requestedAvailableRuns:[...requestedIds].filter(id=>availableIds.has(id)).length, observableUseRatio:row.versionBasis==='offered'&&row.status==='confirmed'&&availableIds.size ? [...requestedIds].filter(id=>availableIds.has(id)).length/availableIds.size : null, failureRatio: row.succeeded + row.failed ? row.failed / (row.succeeded + row.failed) : null}))
    .sort((a, b) => b.outputBytes - a.outputBytes || b.requested - a.requested || JSON.stringify([a.identity,a.version,a.status]).localeCompare(JSON.stringify([b.identity,b.version,b.status])));
  const scope = JSON.stringify([workspaceId, range, input.provider, input.model, input.kind, input.identity, input.version]);
  const revision = createHash('sha256').update(JSON.stringify([scope, projections.map(p => p.revision), incomplete])).digest('hex');
  let offset = 0;
  if (input.cursor) {
    try { const parsed = JSON.parse(Buffer.from(input.cursor, 'base64url').toString()); if (parsed.revision !== revision || parsed.scope !== scope || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error(); offset = parsed.offset; }
    catch { fail('agent_cursor_stale', '参与统计切点已变化，请刷新。', 409); }
  }
  const page = resultRows.slice(offset, offset + (input.limit ?? 50));
  const knownRuns = projections.flatMap(p => p.runs).filter(r => inRange(r.startedAt) && (!input.provider || r.provider===input.provider) && (!input.model || r.model===input.model));
  const gaps = [...new Set(projections.flatMap(p => p.gaps).concat(incomplete ? ['index-building'] : []))];
  const result: ParticipationSummary = {schemaVersion: 'buildr.agent-participation-summary/v1', workspaceId, revision, range,
    coverage: incomplete || gaps.length ? 'partial' : knownRuns.some(r => r.collected) ? 'complete' : 'not-collected',
    runs: knownRuns.length, collectedRuns: knownRuns.filter(r => r.collected).length, gaps, rows: page};
  let bytes = Buffer.byteLength(JSON.stringify(result));
  while (bytes > 900 * 1024 && result.rows.length) {result.rows.pop(); bytes = Buffer.byteLength(JSON.stringify(result));}
  if (offset + result.rows.length < resultRows.length) result.nextCursor = Buffer.from(JSON.stringify({scope, revision, offset: offset + result.rows.length})).toString('base64url');
  return result;
}
