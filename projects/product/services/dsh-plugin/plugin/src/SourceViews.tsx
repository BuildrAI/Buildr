/** Source annotations consume owner records and framework-bound shared read results. */
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconCloseOutlineRegular, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { TrajectoryRecordContext } from '@deepseek-ai/dsh-client-ui-trajectory/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SourceObject, SourceRecordResult, SourceParticipation } from './source-types.ts';
import type { SourceReader, SourceReadState } from './source-reader.ts';
import { sourceRecordKey } from './source-reader.ts';
import { recordedSourceSummary } from './event-sources.ts';
import { sourceObjects, sourceDiagnosticKey, sourceDiagnosticGroup, sourceResultDiagnostics, isBuildrMethod, isBuildrRecord, sourceObjectName, sourceOutcomeKey } from './source-presentation.ts';
import type { PresentedSourceDiagnostic } from './source-presentation.ts';
import styles from './styles.module.css';

export type SourceLocale = 'buildr' | 'buildr-dev';
export interface SourceInjected {
  ensureSource(record: TrajectoryRecordContext): void;
  refreshSource(record: TrajectoryRecordContext): void;
  ensureSourceWindow(records: readonly TrajectoryRecordContext[]): void;
  releaseSourceWindow(): void;
  hooks: { source: SourceReader };
}
type ColumnProps = PropsRuntime<'conversation.trajectory.column'> & InjectFace<SourceInjected> & PropsLocale<SourceLocale>;
type ObjectsProps = PropsRuntime<'conversation.trajectory.inspector.objects'> & InjectFace<SourceInjected> & PropsLocale<SourceLocale>;
type ViewProps = PropsRuntime<'conversation.view'> & InjectFace<SourceInjected> & PropsLocale<SourceLocale>;
type Translate = PropsLocale<SourceLocale>['t'];
type ReadySource = Extract<SourceRecordResult, { ready: true }>;
const partyKeys = { buildr: 'sourcePartyBuildr', workspace: 'sourcePartyWorkspace', openspec: 'sourcePartyOpenspec', external: 'sourcePartyExternal', unknown: 'sourcePartyUnknown' } as const;
const kindKeys = { rule: 'sourceKindRule', skill: 'sourceKindSkill', 'task-brief': 'sourceKindBrief', 'task-material': 'sourceKindMaterial', capability: 'sourceKindCapability' } as const;
const recordKeys = { system: 'sourceRecordSystem', user: 'sourceRecordUser', context: 'sourceRecordContext', compacted: 'sourceRecordCompacted', message: 'sourceRecordMessage', tool: 'sourceRecordTool', subtool: 'sourceRecordSubtool' } as const;
const actionKeys = { 'rule-load': 'sourceActionRule', 'skill-load': 'sourceActionSkill', 'content-read': 'sourceActionRead', 'capability-call': 'sourceActionCall' } as const;
const outcomeKeys = { succeeded: 'sourceOutcomeSucceeded', failed: 'sourceOutcomeFailed', unknown: 'sourceOutcomeUnknown' } as const;
function actionKey(item: Pick<SourceParticipation, 'kind' | 'action'> | undefined) {
  if (item === undefined) return 'sourceRecorded';
  if (item.kind === 'rule-load') return item.action === 'remove' ? 'sourceRuleRemoved' : item.action === 'replace' ? 'sourceRuleReplaced' : item.action === 'load' ? 'sourceRuleLoaded' : 'sourceActionRule';
  return actionKeys[item.kind];
}
function hasBuildr(object: SourceObject): boolean { return isBuildrMethod(object); }
function actionHeadline(item: SourceParticipation | undefined, objects: readonly SourceObject[], t: Translate): string {
  if (item === undefined) return objects.map(sourceObjectName).join(' · ');
  if (item.kind === 'capability-call' && item.operation === 'task inspect' && item.targets?.some(target => target.kind === 'task')) {
    return [t('sourceInspectTask'), ...item.targets.filter(target => target.kind === 'task').map(target => target.title ?? target.id)].join(' ');
  }
  const label = item.kind === 'content-read' ? t('sourceReadAction') : item.kind === 'skill-load' ? t('sourceSkillAction') : t(actionKey(item));
  return [label, item.title, ...(item.kind === 'capability-call' ? item.targets?.map(target => target.title ?? target.id) ?? [] : [])].join(' · ');
}
function outcomeLabel(item: SourceParticipation | undefined, t: Translate): string {
  return t(sourceOutcomeKey(item)) + (item?.kind === 'capability-call' && item.outcome === 'failed' && item.exitCode !== undefined ? ' · ' + t('sourceExitCode') + ' ' + item.exitCode : '');
}
function ParticipationFacts({ items, t }: { items: readonly SourceParticipation[] | undefined; t: Translate }) {
  if (!items?.length) return null;
  return <div className={styles.sourceActions}>{items.map((item, index) => <section key={index}>
    <header><strong>{actionHeadline(item, [], t)}</strong><span className={item.outcome === 'failed' ? styles.sourceColumnError : undefined}>{outcomeLabel(item, t)}</span></header>
    {item.kind !== 'capability-call' && item.targets?.length ? <p className={styles.sourceTargets}>{t('sourceTargets')}: {item.targets.map(target => target.title ?? target.id).join(' · ')}</p> : null}
  </section>)}</div>;
}
function currentSourceState(record: TrajectoryRecordContext, state: SourceReadState | undefined): SourceReadState {
  return state?.revision === sourceRecordKey(record) ? state : { kind: 'settled', mode: 'marker', value: recordedSourceSummary(record), revision: sourceRecordKey(record) };
}
function unmarkedKey(value: SourceRecordResult) {
  const codes = value.ready ? [...(value.diagnostics ?? []).map(item => item.code), ...value.result.items.flatMap(item => item.diagnostic ? [item.diagnostic.code] : [])] : [value.code];
  return codes.includes('source-not-captured') ? 'sourceNotCaptured' as const : codes.includes('source-metadata-invalid') ? 'sourceMetadataInvalid' as const : value.marker?.status === 'not-applicable' ? 'sourceNotApplicable' as const : 'sourceUnknown' as const;
}
function SourceFailure({ state, t }: { state: SourceReadState | undefined; t: Translate }) {
  if (state === undefined) return <p className={styles.sourceMuted}>{t('sourceUnchecked')}</p>;
  if (state.kind !== 'settled') return <p className={styles.sourceMuted}>{t(state.kind === 'queued' ? 'sourceQueued' : 'sourceLoading')}</p>;
  if (state.value.ready) return null;
  const group = sourceDiagnosticGroup(state.value.code);
  return <div className={group === 'error' ? styles.sourceWarning : styles.sourceMuted}>
    <p>{t(sourceDiagnosticKey(state.value.code))}</p>
    {group === 'error' && <small>{t('sourceErrorHint')}</small>}
    {group === 'evidence' && <small>{t('sourceEvidenceHint')}</small>}
  </div>;
}
function DiagnosticGroup({ diagnostics, group, t }: { diagnostics: readonly PresentedSourceDiagnostic[]; group: 'evidence' | 'error'; t: Translate }) {
  const [expanded, setExpanded] = useState(false);
  const values = diagnostics.filter(diagnostic => diagnostic.group === group);
  if (values.length === 0) return null;
  return <details className={group === 'error' ? styles.sourceDiagnosticError : styles.sourceDiagnostics} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{t(group === 'error' ? 'sourceReadErrors' : 'sourceEvidenceIssues')} ({values.length})</summary>
    {expanded && values.map(diagnostic => <p key={diagnostic.code}>{t(sourceDiagnosticKey(diagnostic.code))}</p>)}
  </details>;
}
function SourceDiagnostics({ diagnostics, t }: { diagnostics: readonly PresentedSourceDiagnostic[]; t: Translate }) {
  return <><DiagnosticGroup diagnostics={diagnostics} group="error" t={t}/><DiagnosticGroup diagnostics={diagnostics} group="evidence" t={t}/></>;
}
/** The original source cell reads the same persisted mark as the filtered view, without a request. */
export function SourceColumn(props: ColumnProps) {
  const stored = props.useSource(snapshot => snapshot.records[props.record.recordId]);
  const state = currentSourceState(props.record, stored);
  const value = state.value;
  if (!isBuildrRecord(value)) return <span className={styles.sourceMuted} title={props.t(unmarkedKey(value) === 'sourceNotCaptured' ? 'sourceNotCapturedHint' : unmarkedKey(value))}>{props.t(value.marker?.status === 'not-applicable' ? 'sourceNoAssociation' : unmarkedKey(value))}</span>;
  const objects = value.ready ? sourceObjects(value.result).map(item => item.object).filter(hasBuildr) : [];
  const mixed = value.ready && value.result.items.some(item => item.mixed);
  const action = value.participation?.find(item => item.kind === 'capability-call') ?? value.participation?.[0];
  const failed = action?.outcome === 'failed';
  const description = ['Buildr', props.t('sourceRecorded'), action && props.t(actionKey(action)), action && props.t(outcomeKeys[action.outcome]),
    ...objects.map(sourceObjectName), mixed ? props.t('sourceMixed') : '', state.contentFailed ? props.t('sourceContentUnavailable') : ''].filter(Boolean).join(' · ');
  return <span className={styles.sourceColumnSummary} data-buildr-record-id={props.record.recordId} title={description} aria-label={description}>
    <span className={styles.sourceBadge}>{mixed ? props.t('sourceColumnFragment') : 'Buildr'}</span>
    <span className={failed ? styles.sourceColumnError : styles.sourceMuted}>{props.t(failed && action?.kind === 'capability-call' ? 'sourceColumnCallFailed' : action?.kind === 'content-read' ? 'sourceColumnRead' : actionKey(action))}</span>
  </span>;
}
/** Keep a Markdown rendering fault inside its body; the original-text controls remain mounted. */
class MarkdownBodyBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function ContentObject({ object, t, showName }: { object: SourceObject; t: Translate; showName: boolean }) {
  const [expanded, setExpanded] = useState(true), [evidenceExpanded, setEvidenceExpanded] = useState(false), [raw, setRaw] = useState(false);
  const labels = useMemo<MarkdownLabels>(() => ({ code: { copyLabel: t('sourceCopy'), copiedLabel: t('sourceCopied') }, footnotes: t('sourceFootnotes') }), [t]);
  const text = object.kind === 'capability' || object.capturedCompleteness === 'none' ? undefined : object.observed.content;
  return <article className={styles.sourceObject} data-buildr-object-id={object.identity}>
    {showName && <header><strong>{sourceObjectName(object)}</strong></header>}
    {object.capturedCompleteness === 'partial' && <p className={styles.sourceMuted}>{t('sourceCapturedPartial')}</p>}
    {object.selection && <p className={styles.sourceMuted}>{t('sourceManagedFragmentHint')}</p>}
    {object.kind === 'capability' ? <p className={styles.sourceMuted}>{t('sourceCapabilityContentHint')}</p> : text === undefined ? <p className={styles.sourceMuted}>{t('sourceMissingObserved')}</p> : <>
      <div className={styles.sourceContentHeader}><strong>{t('sourceRecordedContent')}</strong><button type="button" className={styles.sourceContentToggle} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'sourceHideContent' : 'sourceShowContent')}</button></div>
      {expanded && <><div className={styles.sourceViewModes} role="group" aria-label={t('sourceContentDisplay')}><button type="button" aria-pressed={!raw} onClick={() => setRaw(false)}>{t('sourcePreview')}</button><button type="button" aria-pressed={raw} onClick={() => setRaw(true)}>{t('sourceRaw')}</button></div><div className={styles.sourceContent} data-content-view="observed" data-content-format={raw ? 'raw' : 'markdown'}>{raw ? <pre className={styles.sourceText}>{text}</pre> : <MarkdownBodyBoundary fallback={<p className={styles.sourceWarning}>{t('sourceMarkdownFailed')}</p>}><MarkdownText text={text} labels={labels}/></MarkdownBodyBoundary>}</div></>}
    </>}
    <details className={styles.sourceDiagnostics} onToggle={event => setEvidenceExpanded(event.currentTarget.open)}><summary>{t('sourceShowEvidence')}</summary>
      {evidenceExpanded && <dl><dt>{t('sourceIdentity')}</dt><dd>{object.identity}</dd>
        <dt>{t('sourceProvidedBy')}</dt><dd>{t(partyKeys[object.providedBy])}</dd>
        {(object.workspaceId || object.scope) && <><dt>{t('sourceScope')}</dt><dd>{[object.workspaceId, object.scope].filter(Boolean).join(' · ')}</dd></>}
        <dt>{t('sourceSelector')}</dt><dd>{Object.entries(object.selector).map(([key, value]) => <p key={key}><code>{key}</code>: {value}</p>)}</dd>
        {object.capturedVersion && <><dt>{t(object.capturedVersion.target === 'file' ? 'sourceVersionFile' : object.capturedVersion.target === 'entry' ? 'sourceVersionEntry' : 'sourceVersionContent')}</dt><dd>{object.capturedVersion.algorithm} · {object.capturedVersion.digest}</dd></>}
        <dt>{t('sourceEvidence')}</dt><dd>{object.evidence.map((evidence, index) => <p key={index}>{evidence.authority} · {evidence.locator}{evidence.digest === undefined ? '' : ' · ' + evidence.digest}</p>)}</dd>
      </dl>}
    </details>
  </article>;
}
function ObjectResult({ value, t }: { value: ReadySource; t: Translate }) {
  const objects = sourceObjects(value.result).filter(value => hasBuildr(value.object)), [selection, setSelection] = useState<string | null>(null);
  const selected = objects.find(value => value.key === selection) ?? objects[0];
  return <>
    <SourceDiagnostics diagnostics={sourceResultDiagnostics(value)} t={t}/>
    {value.result.items.some(item => item.mixed) && <p className={styles.sourceMuted}>{t('sourceMixedHint')}</p>}
    {selected === undefined ? (value.participation?.some(item => item.kind === 'capability-call') ? null : <p className={styles.sourceMuted}>{t('sourceNoObjects')}</p>) : <>
      {objects.length > 1 && <div className={styles.sourceObjectChoices} role="group" aria-label={t('sourceSelector')}>{objects.map(value => <button type="button" aria-pressed={value.key === selected.key} key={value.key} data-buildr-object-selector={value.object.identity} onClick={() => setSelection(value.key)}>{t(kindKeys[value.object.kind])} · {sourceObjectName(value.object)}</button>)}</div>}
      <ContentObject key={selected.key} object={selected.object} t={t} showName={objects.length > 1 || !value.participation?.length}/>
    </>}
  </>;
}
function RecordResult({ state, t, summary = true }: { state: SourceReadState | undefined; t: Translate; summary?: boolean }) {
  const value = state?.value;
  const obtainedBody = value?.ready && sourceObjects(value.result).some(item => item.object.kind !== 'capability' && item.object.observed.content !== undefined);
  return <>{state?.contentFailed && <p className={styles.sourceWarning}>{t('sourceContentUnavailable')}</p>}{summary && <ParticipationFacts items={value?.participation} t={t}/>}{value?.ready && isBuildrRecord(value) ? <>{state?.kind !== 'settled' && <p className={styles.sourceMuted}>{t(state?.kind === 'queued' ? 'sourceQueued' : 'sourceLoading')}</p>}{state?.mode === 'content' && (state.kind === 'settled' || obtainedBody) && <ObjectResult value={value} t={t}/>}</> : value?.ready ? <><p className={styles.sourceMuted}>{t(unmarkedKey(value) === 'sourceNotCaptured' ? 'sourceNotCapturedHint' : unmarkedKey(value))}</p><SourceDiagnostics diagnostics={sourceResultDiagnostics(value)} t={t}/></> : <SourceFailure state={state} t={t}/>}</>;
}
/** Explicit details read only original content after its recorded source is already known. */
export function SourceObjects(props: ObjectsProps) {
  const key = sourceRecordKey(props.record);
  const stored = props.useSource(snapshot => snapshot.records[props.record.recordId]);
  const state = currentSourceState(props.record, stored);
  const marked = isBuildrRecord(recordedSourceSummary(props.record));
  useEffect(() => { if (marked) props.ensureSource(props.record); }, [marked, props.ensureSource, key]);
  return <section className={styles.sourceObjects} data-buildr-record-id={props.record.recordId}>
    <header><h3>{props.t('sourceObjects')}</h3>{marked && <button type="button" disabled={state.kind !== 'settled'} onClick={() => props.refreshSource(props.record)}>{props.t('sourceRefresh')}</button>}</header>
    <RecordResult state={state} t={props.t}/>
  </section>;
}
interface WindowIssue { record: TrajectoryRecordContext; position: number; diagnostics: PresentedSourceDiagnostic[] }
function RecordIdentifier({ record, t }: { record: TrajectoryRecordContext; t: Translate }) {
  const [expanded, setExpanded] = useState(false);
  return <details className={styles.sourceRecordIdentifier} onToggle={event => setExpanded(event.currentTarget.open)}><summary>{t('sourceRecordIdentifier')}</summary>{expanded && <code>{record.recordId}</code>}</details>;
}
function WindowDiagnostics({ issues, group, t }: { issues: readonly WindowIssue[]; group: 'evidence' | 'error'; t: Translate }) {
  const [expanded, setExpanded] = useState(false), values = issues.filter(issue => issue.diagnostics.some(diagnostic => diagnostic.group === group));
  if (values.length === 0) return null;
  return <details className={group === 'error' ? styles.sourceDiagnosticError : styles.sourceDiagnostics} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{t(group === 'error' ? 'sourceReadErrors' : 'sourceEvidenceIssues')} ({values.length})</summary>
    {expanded && <div className={styles.sourceIssueRecords}>{values.map(issue => <section key={issue.record.recordId}>
      <h3>{t('sourceRecord')} {issue.position + 1} · {t(recordKeys[issue.record.kind])}</h3>
      {issue.diagnostics.filter(diagnostic => diagnostic.group === group).map(diagnostic => <p key={diagnostic.code}>{t(sourceDiagnosticKey(diagnostic.code))}</p>)}
      <RecordIdentifier record={issue.record} t={t}/>
    </section>)}</div>}
  </details>;
}
interface TimedSourceNode { readonly seq?: number; readonly time: number; readonly subCalls?: readonly TimedSourceNode[] }
interface SourceEntry {
  record: TrajectoryRecordContext; state: SourceReadState; objects: SourceObject[]; actions: readonly SourceParticipation[];
  title: string; result: string; failed: boolean; metadata: string; description: string; searchText: string; time: string;
}
const SOURCE_ROW_HEIGHT = 52, SOURCE_LIST_HEADER = 40, SOURCE_OVERSCAN = 6;
/** Buildr uses the original loaded records; the scroll window changes only which rows are mounted. */
export function SourceView(props: ViewProps) {
  const trajectory = props.useTrajectory(value => value), source = props.useSource(value => value);
  const [search, setSearch] = useState(''), [selectedId, setSelectedId] = useState<TrajectoryRecordContext['recordId'] | null>(null), [focusedId, setFocusedId] = useState<TrajectoryRecordContext['recordId'] | null>(null);
  const listRef = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null), pendingFocus = useRef<string | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 480 });
  const entryCache = useRef(new WeakMap<SourceReadState, { t: Translate; time: number | undefined; entry: SourceEntry }>());
  const records = trajectory.recordContexts;
  const formatter = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }), [props.t]);
  const times = useMemo(() => {
    const result = new Map<number, number>();
    const pending: TimedSourceNode[] = [...trajectory.eventNodes];
    while (pending.length) {
      const node = pending.pop()!;
      if (typeof node.seq === 'number' && Number.isSafeInteger(node.seq) && Number.isFinite(node.time)) result.set(node.seq, node.time);
      if (node.subCalls !== undefined) pending.push(...node.subCalls);
    }
    return result;
  }, [trajectory.eventNodes]);
  useEffect(() => {
    if (records !== undefined) props.ensureSourceWindow(records);
    return () => props.releaseSourceWindow();
  }, [records, props.ensureSourceWindow, props.releaseSourceWindow]);
  const prepared = useMemo(() => {
    const entries: SourceEntry[] = [], issues: WindowIssue[] = [];
    let pending = false;
    for (const [position, record] of (records ?? []).entries()) {
      const state = currentSourceState(record, source.records[record.recordId]), value = state.value;
      pending ||= state.kind === 'queued' || state.kind === 'loading';
      if (!isBuildrRecord(value)) continue;
      const diagnostics = sourceResultDiagnostics(value);
      if (diagnostics.length) issues.push({ record, position, diagnostics });
      const time = record.eventRefs.map(ref => times.get(ref.seq)).find(time => time !== undefined);
      const cached = entryCache.current.get(state);
      if (cached?.t === props.t && cached.time === time) { entries.push(cached.entry); continue; }
      const objects = value.ready ? sourceObjects(value.result).map(item => item.object).filter(hasBuildr) : [];
      const actions = value.participation ?? [], action = actions.find(item => item.kind === 'capability-call') ?? actions[0];
      const resultAction = actions.find(item => item.outcome === 'failed') ?? action, failed = resultAction?.outcome === 'failed';
      const title = actionHeadline(action, objects, props.t), result = outcomeLabel(resultAction, props.t);
      const timeLabel = time === undefined ? '' : formatter.format(time);
      const partial = objects.some(object => object.capturedCompleteness === 'partial');
      const metadata = [timeLabel, props.t(recordKeys[record.kind]), partial ? props.t('sourceFragment') : '', action?.operation ?? ''].filter(Boolean).join(' · ');
      const targetText = actions.flatMap(item => item.targets?.flatMap(target => [target.title ?? '', target.id]) ?? []);
      const description = [title, result, props.t('sourceRecorded'), metadata, ...targetText, state.contentFailed ? props.t('sourceContentUnavailable') : ''].filter(Boolean).join(' · ');
      const searchText = [description, ...actions.flatMap(item => [props.t(actionKey(item)), item.title, item.operation ?? '']), ...objects.flatMap(object => [object.identity, sourceObjectName(object)])].join(' ').toLowerCase();
      const entry = { record, state, objects, actions, title, result, failed, metadata, description, searchText, time: timeLabel };
      entryCache.current.set(state, { t: props.t, time, entry }); entries.push(entry);
    }
    return { entries, issues, pending, byId: new Map(entries.map(entry => [entry.record.recordId, entry])) };
  }, [records, source, times, formatter, props.t]);
  const matches = useMemo(() => {
    const query = search.toLowerCase(); return query ? prepared.entries.filter(entry => entry.searchText.includes(query)) : prepared.entries;
  }, [prepared, search]);
  const virtualized = matches.length > 100;
  const start = virtualized ? Math.max(0, Math.min(matches.length - 1, Math.floor(Math.max(0, viewport.top - SOURCE_LIST_HEADER) / SOURCE_ROW_HEIGHT)) - SOURCE_OVERSCAN) : 0;
  const end = virtualized ? Math.min(matches.length, start + Math.ceil(viewport.height / SOURCE_ROW_HEIGHT) + SOURCE_OVERSCAN * 2) : matches.length;
  const visible = matches.slice(start, end);
  const firstVisibleIndex = Math.max(0, Math.min(matches.length - 1, Math.floor(Math.max(0, viewport.top - SOURCE_LIST_HEADER) / SOURCE_ROW_HEIGHT)));
  const lastVisibleIndex = Math.max(firstVisibleIndex, Math.min(matches.length - 1, Math.ceil((viewport.top + viewport.height - SOURCE_LIST_HEADER) / SOURCE_ROW_HEIGHT) - 1));
  const focusedOffset = visible.findIndex(entry => entry.record.recordId === focusedId), focusedIndex = start + focusedOffset;
  const tabStopId = focusedOffset >= 0 && focusedIndex >= firstVisibleIndex && focusedIndex <= lastVisibleIndex ? focusedId : matches[firstVisibleIndex]?.record.recordId;
  useLayoutEffect(() => {
    const list = listRef.current; if (list === null) return;
    const measure = () => setViewport(previous => {
      const next = { top: list.scrollTop, height: list.clientHeight || 480 };
      return previous.top === next.top && previous.height === next.height ? previous : next;
    });
    let frame: number | undefined;
    const scroll = () => { if (frame === undefined) frame = requestAnimationFrame(() => { frame = undefined; measure(); }); };
    measure(); list.addEventListener('scroll', scroll, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure); observer?.observe(list);
    return () => { list.removeEventListener('scroll', scroll); observer?.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [records !== undefined && records.length > 0]);
  useLayoutEffect(() => {
    const list = listRef.current; if (list === null) return;
    list.scrollTop = 0; setViewport(previous => previous.top === 0 ? previous : { ...previous, top: 0 });
  }, [search]);
  useLayoutEffect(() => {
    const id = pendingFocus.current; if (id === null) return;
    const button = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-buildr-record-selector]') ?? [])].find(button => button.dataset.buildrRecordSelector === id);
    if (button !== undefined) { pendingFocus.current = null; button.focus({ preventScroll: true }); }
  }, [start, end, focusedId, matches]);
  const selectedEntry = selectedId === null ? undefined : prepared.byId.get(selectedId);
  const selected = selectedEntry?.record, selectedState = selectedEntry?.state;
  const selectedKey = selected === undefined ? undefined : sourceRecordKey(selected);
  useEffect(() => { if (selected !== undefined) props.ensureSource(selected); }, [selectedId, selectedKey, props.ensureSource]);
  useEffect(() => { if (selectedId !== null && !prepared.byId.has(selectedId)) setSelectedId(null); }, [selectedId, prepared]);
  const choose = (record: TrajectoryRecordContext) => { setSelectedId(record.recordId); props.ensureSource(record); };
  const closeDetails = () => {
    const id = selectedId, focusedBeforeClose = document.activeElement; setSelectedId(null);
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active !== focusedBeforeClose && active !== document.body && active !== null) return;
      const list = listRef.current, listBox = list?.getBoundingClientRect(), viewBox = list?.closest('main')?.getBoundingClientRect();
      const rows = [...(list?.querySelectorAll<HTMLButtonElement>('[data-buildr-record-selector]') ?? [])];
      const visible = (row: HTMLButtonElement) => {
        if (listBox === undefined || viewBox === undefined) return false;
        const box = row.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom > Math.max(listBox.top, viewBox.top) && box.top < Math.min(listBox.bottom, viewBox.bottom) && box.right > Math.max(listBox.left, viewBox.left) && box.left < Math.min(listBox.right, viewBox.right);
      };
      const row = rows.find(row => row.dataset.buildrRecordSelector === id && visible(row));
      (row ?? rows.find(visible) ?? searchRef.current)?.focus({ preventScroll: true });
    });
  };
  const focusAt = (index: number) => {
    const entry = matches[index], list = listRef.current; if (entry === undefined || list === null) return;
    const top = SOURCE_LIST_HEADER + index * SOURCE_ROW_HEIGHT, bottom = top + SOURCE_ROW_HEIGHT;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = Math.max(0, bottom - (list.clientHeight || 480));
    pendingFocus.current = entry.record.recordId; setFocusedId(entry.record.recordId);
    setViewport({ top: list.scrollTop, height: list.clientHeight || 480 });
  };
  const renderRow = (entry: SourceEntry, index: number) => <button type="button" key={entry.record.recordId} data-buildr-record-selector={entry.record.recordId} data-buildr-record-index={index} aria-pressed={entry.record.recordId === selectedId} title={entry.description} aria-label={entry.description} tabIndex={tabStopId === entry.record.recordId ? 0 : -1} onFocus={() => setFocusedId(entry.record.recordId)} onClick={() => choose(entry.record)} onKeyDown={event => {
    const next = event.key === 'ArrowDown' ? Math.min(matches.length - 1, index + 1) : event.key === 'ArrowUp' ? Math.max(0, index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? matches.length - 1 : undefined;
    if (next !== undefined) { event.preventDefault(); focusAt(next); }
  }}>
    <span className={styles.sourceRecordMain}><strong>{entry.title}</strong><span className={styles.sourceRecordStatus}><span className={entry.failed ? styles.sourceColumnError : undefined}>{entry.result}</span>{entry.state.contentFailed && <span>{props.t('sourceContentReadFailed')}</span>}</span></span>
    <span className={styles.sourceRecordMeta} title={entry.metadata}>{entry.metadata}</span>
  </button>;
  if (records === undefined) return <div className={styles.sourceView}><p>{props.t('sourceViewUnsupported')}</p></div>;
  return <main className={styles.sourceView} data-details-open={selected !== undefined}>
    <header><h2>{props.t('sourceObjects')}</h2><input ref={searchRef} type="search" aria-label={props.t('sourceSearch')} placeholder={props.t('sourceSearchPlaceholder')} value={search} onChange={event => setSearch(event.target.value)}/></header>
    <p className={styles.sourceMuted}>{props.t('sourceLoadedScope')}</p>
    {prepared.pending && <p className={styles.sourceMuted}>{props.t('sourcePendingWindow')}</p>}
    {records.length === 0 ? <p>{props.t('sourceNoLoadedRecords')}</p> : <div className={styles.sourceViewLayout + (selected === undefined ? ' ' + styles.sourceViewListOnly : '')}>
      <div className={styles.sourceRecords} ref={listRef} data-buildr-record-count={matches.length} data-buildr-virtualized={virtualized} data-buildr-first-visible-index={firstVisibleIndex} data-buildr-window-start={start} data-buildr-window-end={end}>
        <h3>{props.t('sourceListRecords')}</h3>
        {matches.length === 0 ? <p className={styles.sourceMuted}>{props.t(search ? 'sourceNoSearchMatches' : prepared.pending ? 'sourceLoading' : 'sourceNoMatches')}</p> : <>
          {start > 0 && <div className={styles.sourceListSpacer} aria-hidden="true" style={{ height: start * SOURCE_ROW_HEIGHT }}/>} {visible.map((entry, offset) => renderRow(entry, start + offset))}
          {end < matches.length && <div className={styles.sourceListSpacer} aria-hidden="true" style={{ height: (matches.length - end) * SOURCE_ROW_HEIGHT }}/>}
        </>}
      </div>
      {selectedEntry !== undefined && selected !== undefined && <section className={styles.sourceDetail} aria-label={props.t('sourceDetails')}>
        <header className={styles.sourceDetailHeader}><div className={styles.sourceDetailTitle}><div><strong>{props.t('sourceDetails')}</strong><small>{[selectedEntry.time, props.t(recordKeys[selected.kind])].filter(Boolean).join(' · ')}</small></div><button type="button" className={styles.sourceDetailClose} title={props.t('sourceCloseDetails')} aria-label={props.t('sourceCloseDetails')} onClick={closeDetails}><IconCloseOutlineRegular size={16}/></button></div>
          <ParticipationFacts items={selectedEntry.actions} t={props.t}/>
          <div className={styles.sourceDetailActions}><button type="button" onClick={() => props.openView('trajectory', selected.callId ?? '')}>{props.t(selected.callId ? 'sourceOriginal' : 'sourceOriginalTrajectory')}</button><button type="button" disabled={selectedState?.kind === 'queued' || selectedState?.kind === 'loading'} onClick={() => props.refreshSource(selected)}>{props.t('sourceRefresh')}</button></div>
        </header>
        <RecordResult key={selectedKey} state={selectedState} t={props.t} summary={false}/>
        <RecordIdentifier record={selected} t={props.t}/>
      </section>}
    </div>}
    <WindowDiagnostics issues={prepared.issues} group="error" t={props.t}/><WindowDiagnostics issues={prepared.issues} group="evidence" t={props.t}/>
  </main>;
}
