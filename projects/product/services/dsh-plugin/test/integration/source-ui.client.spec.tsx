// @vitest-environment jsdom
/** Real SlotRegistry, ui-session and renderer with actual Trajectory and Buildr applies. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SlotTestRuntime, stubConfigForm, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { UiConversation, EMPTY_CONVERSATION_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ConversationBinding, ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import * as localePlugin from '@deepseek-ai/dsh-client-locale/client';
import * as trajectoryPlugin from '@deepseek-ai/dsh-client-ui-trajectory/client';
import * as buildrPlugin from '../../plugin/src/client.tsx';
import { deriveTrajectoryLayout } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/layout.ts';
import { trajectoryRecordContext } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/trajectory-extensions.ts';
import { trajectoryVirtualRecordKey } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/trajectory-virtual-rows.ts';
import { contextForm, contextProducer } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/trajectory-event-projection.ts';
import { parseSourceRecordRequest } from '../../plugin/src/source-records.ts';
import type { SourceRecordRequest, SourceRecordResult } from '../../plugin/src/source-types.ts';
import { zh } from '../../plugin/src/locales.ts';
import { recordedSourceSummary } from '../../plugin/src/event-sources.ts';
import { sources, withBody } from '../support/recorded-sources.ts';
import type { EventSources } from '../../plugin/src/source-types.ts';
import type { ActivationStatus } from '../../plugin/src/types.ts';
const markdownFailure = vi.hoisted(() => ({ enabled: false }));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async importOriginal => {
 const original = await importOriginal<typeof import('@deepseek-ai/dsh-client-ui-primitives')>();
 return { ...original, MarkdownText: (props: Parameters<typeof original.MarkdownText>[0]) => {
  if (markdownFailure.enabled) throw Error('Controlled Markdown renderer fault');
  return createElement(original.MarkdownText, props);
 } };
});
usePinnedBrowserLanguages('zh-CN');
const SID = 'source-session' as SessionId;
const runtimes: SlotTestRuntime[] = [], references: { release(): void }[] = [];
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeEach(() => {
 // The SDK's virtual table fixtures model viewport height through the same resize observer.
 vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
 Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
 const originalBounds = HTMLElement.prototype.getBoundingClientRect;
 // jsdom has no layout. Model only the Buildr list's documented row/header units;
 // compiled Chromium checks remain responsible for physical browser geometry.
 vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
  if (this.matches('main[data-details-open]')) return new DOMRect(0, 0, 600, 800);
  if (this.matches('[data-buildr-record-count]')) return new DOMRect(0, 100, 600, 480);
  if (this.matches('[data-buildr-record-selector]')) {
   const list = this.closest<HTMLElement>('[data-buildr-record-count]');
   if (list !== null) return new DOMRect(0, 100 + 40 + Number(this.dataset.buildrRecordIndex) * 52 - list.scrollTop, 600, 52);
  }
  return originalBounds.call(this);
 });
});
afterEach(async () => {
 cleanup(); vi.restoreAllMocks();
 if (originalScrollTo === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
 else Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
 for (const reference of references.splice(0)) reference.release();
 for (const runtime of runtimes.splice(0)) await runtime.dispose(); localStorage.clear();
});
type EventNode = TrajectorySnapshot['eventNodes'][number];
function contextNode(seq: number, captured: EventSources | null = sources('Buildr 核心规则')): EventNode {
 const source = { kind: 'agent-instructions', form: 'instructions', changes: [{ action: 'set', path: '/captured/AGENTS.md' }], ...(captured === null ? {} : { eventSources: captured }) };
 return { kind: 'context', seq, time: 1000 + seq, content: [{ type: 'text', text: 'Actual captured method body ' + seq }], source,
  ...(captured === null ? {} : { eventSources: captured }), producer: contextProducer(source), form: contextForm(source) };
}
function ordinaryNodes(count: number): EventNode[] {
 return Array.from({ length: count }, (_, index): EventNode[] => [
  { kind: 'user', seq: index * 2 + 1, time: 1000 + index * 2, content: [{ type: 'text', text: 'Ordinary human input ' + index }], source: { kind: 'user' } },
  { kind: 'assistant', seq: index * 2 + 2, time: 1001 + index * 2, turn: index + 1, step: 1, blocks: [{ kind: 'text', text: 'Ordinary assistant reply ' + index }] },
 ]).flat();
}
function trajectoryFixture(nodes: TrajectorySnapshot['eventNodes']) {
 const cells = deriveTrajectoryLayout({ nodes, partial: null, runningCalls: [], eventLocations: new Map() }, key => key).flatMap(turn => turn.groups.flatMap(group => group.cells));
 const recordContexts = cells.flatMap(cell => { const record = trajectoryRecordContext(SID, cell); return record === undefined ? [] : [record]; });
 const snapshot: TrajectorySnapshot = { eventNodes: nodes, eventLocations: new Map(), requests: [], callSchemas: new Map(), partial: null, runningCalls: [], recordContexts };
 return { snapshot, cells };
}
function readySource(input: SourceRecordRequest, body = 'Recorded method body'): SourceRecordResult {
 return withBody(input.record as never, body);
}
async function createScene(nodes: TrajectorySnapshot['eventNodes'], query: (input: SourceRecordRequest) => Promise<SourceRecordResult>, only = 'buildr', qualification?: () => ActivationStatus) {
 const runtime = await SlotTestRuntime.create(); runtimes.push(runtime); const ctx = runtime.ctx;
 await runtime.sessions.add({ id: SID, snapshot: { blank: false }, session: { loadOlder: () => Promise.resolve() } });
 const reference = runtime.sessions.retain(SID); references.push(reference); await reference.ready;
 const fixture = trajectoryFixture(nodes), trajectoryStore = createSnapshotStore(fixture.snapshot);
 const conversationStore = createSnapshotStore<ConversationSnapshot>({ ...EMPTY_CONVERSATION_SNAPSHOT, activeTargets: new Set(['trajectory']) });
 const conversation = new UiConversation(ctx, runtime.sessions);
 const binding: ConversationBinding = { snapshot: conversationStore, openTurn: createSnapshotStore<number | undefined>(undefined), activate: () => {}, target: target => target === 'trajectory' ? trajectoryStore : createSnapshotStore(undefined) };
 vi.spyOn(conversation, 'binding').mockReturnValue(binding);
 await runtime.declare({ 'conversation.view': { kind: 'list', scope: 'session' }, 'sidebar.footer.action': { kind: 'list', scope: 'root' }, 'shell.overlay': { kind: 'list', scope: 'root' } } as never);
 ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never);
 ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never); await runtime.mount(localePlugin);
 const requests: SourceRecordRequest[] = [];
 const sourceRecord = async (input: SourceRecordRequest): Promise<{ ok: true; value: SourceRecordResult }> => { const parsed = parseSourceRecordRequest(input); requests.push(parsed); const originalRecord = trajectoryStore.getSnapshot().recordContexts?.find(record => record.recordId === parsed.record.recordId); if (!originalRecord) throw Error('Missing original captured fixture record'); return { ok: true, value: await query({ ...parsed, record: originalRecord }) }; };
 vi.spyOn(runtime.remote, '$mount').mockResolvedValue(async () => {});
 runtime.remote.provideNamespaces({ buildr: { activation: async () => ({ ok: true, value: qualification?.() ?? { active: true, packageName: '@buildr-ai/buildr-dsh-plugin' } }), open: async () => ({ ok: true, value: { ready: false, code: 'fixture-only', message: '' } }), sourceRecord } });
 ctx.provide('sidebarRight', { mounted: createSnapshotStore(SID), openTabs: createSnapshotStore([]), active: () => undefined, isExpanded: () => false, toggleExpanded: () => {}, focus: () => {}, openTab: () => { throw Error('unexpected sidebar navigation'); } } as never);
 ctx.provide('layout', { panelInfo: runtime.panelInfo } as never);
 await runtime.mount(trajectoryPlugin); const buildr = await runtime.mount(buildrPlugin);
 if (qualification === undefined) await waitFor(() => expect(runtime.slots.entries('conversation.view').some(entry => entry.options.id === 'buildr')).toBe(true));
 const owner = { inspectCall: undefined, viewRequest: undefined, openView: () => {}, completeViewRequest: () => {} };
 const original = runtime.renderSlot('conversation.view', owner, { session: reference, only });
 return { runtime, reference, buildr, owner, original, requests, trajectoryStore, ...fixture };
}
function openDetails(container: HTMLElement, label: string): void {
 const summary = [...container.querySelectorAll('summary')].find(element => element.textContent === label);
 if (summary === undefined) throw Error('missing details summary: ' + label); fireEvent.click(summary);
}
async function clickRecord(container: HTMLElement, recordId: string): Promise<void> {
 await waitFor(() => expect([...container.querySelectorAll('[data-buildr-record-selector]')].some(element => element.getAttribute('data-buildr-record-selector') === recordId)).toBe(true));
 const button = [...container.querySelectorAll('[data-buildr-record-selector]')].find(element => element.getAttribute('data-buildr-record-selector') === recordId)!; fireEvent.click(button);
}
const contentRequests = (requests: SourceRecordRequest[]) => requests;

it('original source cells and the Buildr tab use recorded marks immediately, without any automatic Host request', async () => {
 const scene = await createScene([contextNode(1)], async input => readySource(input, 'Captured body'), 'trajectory');
 const { original, requests, owner, reference, snapshot, cells, buildr, runtime } = scene;
 expect(requests).toEqual([]); expect(original.container.querySelectorAll('col').length).toBe(3);
 const cell = original.container.querySelector('td [data-buildr-record-id]'); expect(cell?.textContent).toContain('Buildr'); expect(cell?.getAttribute('title')).toContain(zh.sourceRecorded);
 original.update(owner, { session: reference, only: 'buildr' }); await waitFor(() => expect(original.container.querySelectorAll('[data-buildr-record-selector]').length).toBe(1));
 expect(requests).toEqual([]); expect(original.container.querySelector('[data-content-view]')).toBeNull(); expect(original.view.queryByRole('region', { name: zh.sourceDetails })).toBeNull();
 await clickRecord(original.container, snapshot.recordContexts[0]!.recordId); await waitFor(() => expect(original.view.getByText('Captured body')).toBeTruthy());
 expect(requests.length).toBe(1); expect(requests[0]!.record.eventSources).toBeUndefined(); expect(original.container.querySelector('[data-content-view="observed"]')).toBeTruthy(); expect(original.view.queryByRole('button', { name: zh.sourceCurrent })).toBeNull();
 original.update(owner, { session: reference, only: 'trajectory' }); fireEvent.click(original.container.querySelector('tr[data-record-index="' + cells[0]!.index + '"]')!);
 await waitFor(() => expect(original.view.getByText('Captured body')).toBeTruthy()); expect(requests.length).toBe(1);
 await act(() => buildr.dispose()); expect(runtime.slots.entries('conversation.view').some(entry => entry.options.id === 'trajectory')).toBe(true);
});

it('ordinary, uncaptured, unknown and non-Buildr records remain out of the filtered list without reverse queries', async () => {
 const unknown: EventSources = { schemaVersion: 'dsh.event-sources/v1', status: 'unknown', matches: [] };
 const scene = await createScene([...ordinaryNodes(250), contextNode(501, null), contextNode(502, unknown), contextNode(503, sources('User rule', { providedBy: 'workspace' }))], async () => { throw Error('No source fallback'); });
 const { original, requests, owner, reference, cells } = scene; await waitFor(() => expect(original.view.getByText(zh.sourceNoMatches)).toBeTruthy());
 expect(requests).toEqual([]); expect(original.container.querySelectorAll('[data-buildr-record-selector], [data-buildr-candidate-selector]').length).toBe(0); expect(original.container.querySelector('pre')).toBeNull();
 const uncapturedScene = await createScene([contextNode(1, null)], async () => { throw Error('Uncaptured record must not query'); }, 'trajectory');
 fireEvent.click(uncapturedScene.original.container.querySelector('tr[data-record-index="' + uncapturedScene.cells[0]!.index + '"]')!);
 await waitFor(() => expect(uncapturedScene.original.view.getByText(zh.sourceNotCapturedHint)).toBeTruthy()); expect(uncapturedScene.requests).toEqual([]); expect(uncapturedScene.original.view.queryByRole('button', { name: zh.sourceRefresh })).toBeNull();

});

it('invalid captured metadata remains local and never exposes an embedded body or initiates a query', async () => {
 const invalid = { ...sources(), content: 'Private user material' } as never;
 const scene = await createScene([contextNode(1, invalid)], async () => { throw Error('Invalid metadata cannot reverse-query'); }, 'trajectory');
 const { original, cells, requests } = scene; fireEvent.click(original.container.querySelector('tr[data-record-index="' + cells[0]!.index + '"]')!);
 await waitFor(() => expect(original.view.getAllByText(zh.sourceMetadataInvalid).length).toBeGreaterThan(0)); expect(requests).toEqual([]); expect(original.container.textContent).not.toContain('Private user material');
});

it('1000 loaded tool owners expose only 31 captured Buildr events with zero initial reads and three selected content reads', async () => {
 const nodes: EventNode[] = Array.from({ length: 1000 }, (_, index) => ({ kind: 'tool-result', seq: index + 1, time: 1000 + index, callId: 'call-' + index, call: { name: 'read', argsRaw: '{}' }, callTime: 1000 + index, content: [{ type: 'text', text: 'Original read body ' + (index + 1) }], isError: false, subCalls: [], ...(index % 33 === 0 ? { eventSources: sources('method-' + (index + 1), { action: 'read' }) } : {}) }));
 const scene = await createScene(nodes, async input => readySource(input, 'Selected body ' + input.record.eventRefs[0]!.seq));
 const { original, requests, snapshot, trajectoryStore } = scene;
 await waitFor(() => expect(original.container.querySelectorAll('[data-buildr-record-selector]').length).toBe(31)); expect(requests).toEqual([]); expect(original.container.querySelector('pre')).toBeNull();
 for (const seq of [1, 496, 991]) { await clickRecord(original.container, snapshot.recordContexts.find(record => record.eventRefs.some(ref => ref.seq === seq))!.recordId); await waitFor(() => expect(original.view.getByText('Selected body ' + seq)).toBeTruthy()); }
 expect(requests.length).toBe(3); await act(() => trajectoryStore.set({ ...snapshot, recordContexts: snapshot.recordContexts.map(record => ({ ...record })) })); expect(requests.length).toBe(3);
 fireEvent.change(original.view.getByRole('searchbox'), { target: { value: 'method-496' } }); expect(original.container.querySelectorAll('[data-buildr-record-selector]').length).toBe(1); expect(requests.length).toBe(3);
});

it('full-width default, filtering, original order, focus and cached close/reopen stay local', async () => {
 const scene = await createScene([contextNode(1, sources('rule-one')), contextNode(2, sources('rule-two'))], async input => readySource(input, 'Body ' + input.record.eventRefs[0]!.seq));
 const { original, requests, snapshot } = scene; const ids = () => [...original.container.querySelectorAll('[data-buildr-record-selector]')].map(row => row.getAttribute('data-buildr-record-selector'));
 await waitFor(() => expect(ids()).toEqual(snapshot.recordContexts.map(record => record.recordId))); expect(requests).toEqual([]); expect(original.view.queryByRole('region', { name: zh.sourceDetails })).toBeNull();
 const first = snapshot.recordContexts[0]!.recordId; await clickRecord(original.container, first); await waitFor(() => expect(original.view.getByText('Body 1')).toBeTruthy());
 const search = original.view.getByRole('searchbox'); fireEvent.change(search, { target: { value: 'rule-two' } }); fireEvent.click(original.view.getByRole('button', { name: zh.sourceCloseDetails }));
 await waitFor(() => expect(original.view.queryByRole('region', { name: zh.sourceDetails })).toBeNull()); expect(document.activeElement?.getAttribute('data-buildr-record-selector')).toBe(snapshot.recordContexts[1]!.recordId); expect(requests.length).toBe(1);
 fireEvent.change(search, { target: { value: '' } }); await clickRecord(original.container, first); await waitFor(() => expect(original.view.getByText('Body 1')).toBeTruthy()); expect(requests.length).toBe(1);
 fireEvent.change(search, { target: { value: 'nothing' } }); fireEvent.click(original.view.getByRole('button', { name: zh.sourceCloseDetails })); await waitFor(() => expect(document.activeElement).toBe(search)); expect(requests.length).toBe(1);
});

it('a late original-content reply cannot reopen closed details and reopening uses its cache', async () => {
 const delayed = Promise.withResolvers<SourceRecordResult>(); const scene = await createScene([contextNode(1)], async () => delayed.promise);
 const { original, requests, snapshot } = scene; await clickRecord(original.container, snapshot.recordContexts[0]!.recordId); await waitFor(() => expect(requests.length).toBe(1));
 expect(original.view.queryByText(zh.sourceMissingObserved)).toBeNull(); fireEvent.click(original.view.getByRole('button', { name: zh.sourceCloseDetails }));
 await act(async () => { delayed.resolve(withBody(snapshot.recordContexts[0]!, 'Late original body')); await delayed.promise; }); expect(original.view.queryByRole('region', { name: zh.sourceDetails })).toBeNull();
 await clickRecord(original.container, snapshot.recordContexts[0]!.recordId); await waitFor(() => expect(original.view.getByText('Late original body')).toBeTruthy()); expect(requests.length).toBe(1);
});

it('a failed original-content read preserves the recorded source and prior body with a local error', async () => {
 let calls = 0; const scene = await createScene([contextNode(1)], async input => ++calls === 1 ? readySource(input, 'Original retained body') : { ready: false, code: 'source-timeout', message: 'Private Host error', marker: { status: 'unknown' } });
 const { original, requests, snapshot } = scene; await clickRecord(original.container, snapshot.recordContexts[0]!.recordId); await waitFor(() => expect(original.view.getByText('Original retained body')).toBeTruthy());
 fireEvent.click(original.view.getByRole('button', { name: zh.sourceRefresh })); await waitFor(() => expect(original.view.getByText(zh.sourceContentUnavailable)).toBeTruthy());
 expect(original.view.getByText('Original retained body')).toBeTruthy(); expect(original.container.querySelectorAll('[data-buildr-record-selector]').length).toBe(1); expect(original.container.textContent).not.toContain('Private Host error'); expect(requests.length).toBe(2);
});

it('failed capability events keep their recorded mark and necessary references without displaying user body', async () => {
 const capability = sources('task inspect', { kind: 'capability', action: 'call', operation: 'task inspect', contentRefs: [], completeness: 'none', observedVersion: { algorithm: 'sha256', digest: 'b'.repeat(64), target: 'entry' }, targets: [{ kind: 'task', id: 'fixture-task' }] });
 const node = { kind: 'tool-result' as const, seq: 1, time: 1000, callId: 'failed-call', call: { name: 'bash', argsRaw: '{}' }, callTime: 900, content: [{ type: 'text' as const, text: 'Private user brief in original result' }], isError: true, eventSources: capability, subCalls: [] };
 const scene = await createScene([node], async () => { throw Error('Body-free capability must not read original event bodies'); });
 const { original, requests, snapshot } = scene; expect(requests).toEqual([]); await clickRecord(original.container, snapshot.recordContexts[0]!.recordId);
 await waitFor(() => expect(original.view.getAllByText(zh.sourceExecutionFailed).length).toBeGreaterThan(0)); expect(original.container.querySelector('[data-content-view]')).toBeNull(); expect(original.container.textContent).not.toContain('Private user brief');
 const detail = original.view.getByRole('region', { name: zh.sourceDetails });
 expect(detail.textContent?.match(/fixture-task/g)).toHaveLength(1); expect(detail.textContent).toContain(zh.sourceInspectTask + ' fixture-task');
 fireEvent.change(original.view.getByRole('searchbox'), { target: { value: 'fixture-task' } }); expect(original.container.querySelectorAll('[data-buildr-record-selector]').length).toBe(1); expect(requests.length).toBe(0);
});

it('mixed recorded methods have separate selectors and recorded file/content/entry versions retain their meaning', async () => {
 const metadata: EventSources = { ...sources('first-method'), matches: [...sources('first-method', { observedVersion: { algorithm: 'sha256', digest: 'a'.repeat(64), target: 'file' } }).matches, ...sources('second-method').matches], mixed: true };
 const scene = await createScene([contextNode(1, metadata)], async input => readySource(input, 'Original selected method body'));
 const { original, snapshot } = scene; await clickRecord(original.container, snapshot.recordContexts[0]!.recordId); await waitFor(() => expect(original.container.querySelectorAll('[data-buildr-object-selector]').length).toBe(2));
 openDetails(original.container, zh.sourceShowEvidence); await waitFor(() => expect(original.view.getByText(zh.sourceVersionFile)).toBeTruthy()); expect(original.view.queryByRole('button', { name: zh.sourceCurrent })).toBeNull();
 fireEvent.click(original.container.querySelectorAll('[data-buildr-object-selector]')[1]!); openDetails(original.container, zh.sourceShowEvidence); await waitFor(() => expect(original.view.getByText(zh.sourceVersionContent)).toBeTruthy());
});

it('executor outcomes distinguish nonzero CLI exit, zero exit and unknown background execution without parsing output', async () => {
 const outcomes = ['failed', 'succeeded', 'unknown'] as const;
 const nodes: EventNode[] = outcomes.map((outcome, index) => ({ kind: 'tool-result', seq: index + 1, time: 1000 + index, callId: 'cli-outcome-' + outcome,
  call: { name: 'bash', argsRaw: '{}' }, callTime: 900 + index, content: [{ type: 'text', text: 'Output prose says succeeded; never outcome authority.' }], isError: false, subCalls: [],
  eventSources: { ...sources('CLI ' + outcome, { kind: 'capability', action: 'call', completeness: 'none', contentRefs: [] }), execution: { outcome, ...(outcome === 'unknown' ? {} : { exitCode: outcome === 'failed' ? 1 : 0 }) } } }));
 const scene = await createScene(nodes, async input => readySource(input));
 expect(scene.requests).toEqual([]);
 const rows = [...scene.original.container.querySelectorAll('[data-buildr-record-selector]')]; expect(rows.length).toBe(3);
 rows.forEach((row, index) => expect(row.querySelector('strong')?.nextElementSibling?.textContent).toBe(({ failed: zh.sourceExecutionFailed + ' · ' + zh.sourceExitCode + ' 1', succeeded: zh.sourceExecutionSucceeded, unknown: zh.sourceOutcomeUnknown })[outcomes[index]!]));
 expect(scene.original.container.textContent).not.toContain('Output prose');
});

it('partial method content is labeled as a retained fragment and none never displays a body', async () => {
 const scene = await createScene([contextNode(1, sources('partial method', { completeness: 'partial' })), contextNode(2, sources('no captured method text', { completeness: 'none', contentRefs: [] }))], async input => readySource(input, input.record.eventRefs[0]!.seq === 1 ? 'Actual retained fragment' : 'Unexpected body must remain hidden'));
 await clickRecord(scene.original.container, scene.snapshot.recordContexts[0]!.recordId);
 await waitFor(() => expect(scene.original.view.getByText('Actual retained fragment')).toBeTruthy()); expect(scene.original.view.getByText(zh.sourceCapturedPartial)).toBeTruthy();
 await clickRecord(scene.original.container, scene.snapshot.recordContexts[1]!.recordId);
 await waitFor(() => expect(scene.original.view.getByText(zh.sourceMissingObserved)).toBeTruthy()); expect(scene.original.container.querySelector('[data-content-view]')).toBeNull(); expect(scene.original.container.textContent).not.toContain('Unexpected body');
});

it('a recorded source without an action does not claim a rule load or content read', async () => {
 const metadata = sources('Captured catalog identity', { action: undefined, completeness: 'none', contentRefs: [] });
 const scene = await createScene([contextNode(1, metadata)], async input => readySource(input), 'trajectory');
 const column = scene.original.container.querySelector('td [data-buildr-record-id]')!; expect(column.getAttribute('title')).toContain(zh.sourceRecorded); expect(column.getAttribute('title')).not.toContain(zh.sourceActionRule); expect(column.getAttribute('title')).not.toContain(zh.sourceActionRead);
 scene.original.update(scene.owner, { session: scene.reference, only: 'buildr' }); await waitFor(() => expect(scene.original.container.querySelectorAll('[data-buildr-record-selector]').length).toBe(1));
 expect(scene.original.container.querySelector('[data-buildr-record-selector]')?.textContent).not.toContain(zh.sourceActionRule); expect(scene.requests).toEqual([]);
});

it('a large filtered list mounts a bounded window and keyboard navigation reaches its last record with exact original identity', async () => {
 const scene = await createScene(Array.from({ length: 500 }, (_, index) => contextNode(index + 1, sources('method-' + String(index).padStart(3, '0')))), async input => readySource(input, 'Original last method body'));
 const { original, requests, snapshot } = scene;
 const list = original.container.querySelector<HTMLElement>('[data-buildr-record-count]')!;
 expect(list.dataset.buildrRecordCount).toBe('500'); expect(list.dataset.buildrVirtualized).toBe('true');
 expect(list.querySelectorAll('[data-buildr-record-selector]').length).toBeLessThan(40); expect(requests).toEqual([]);
 const first = list.querySelector<HTMLButtonElement>('[data-buildr-record-selector]')!;
 fireEvent.focus(first); fireEvent.keyDown(first, { key: 'End' });
 const lastId = snapshot.recordContexts.at(-1)!.recordId;
 await waitFor(() => expect((document.activeElement as HTMLElement)?.dataset.buildrRecordSelector).toBe(lastId));
 expect(list.querySelectorAll('[data-buildr-record-selector]').length).toBeLessThan(40); expect(requests).toEqual([]);
 fireEvent.click(document.activeElement!); await waitFor(() => expect(original.view.getByText('Original last method body')).toBeTruthy());
 const top = list.scrollTop; fireEvent.click(original.view.getByRole('button', { name: zh.sourceCloseDetails }));
 expect(original.container.querySelector('[data-buildr-record-count]')).toBe(list); expect(list.scrollTop).toBe(top); expect((document.activeElement as HTMLElement).dataset.buildrRecordSelector).toBe(lastId);
 const search = original.view.getByRole('searchbox'); search.focus(); fireEvent.change(search, { target: { value: 'method-001' } });
 await waitFor(() => expect(list.dataset.buildrRecordCount).toBe('1')); expect(document.activeElement).toBe(search);
 expect(list.querySelectorAll('[data-buildr-record-selector][tabindex="0"]').length).toBe(1);
 fireEvent.change(search, { target: { value: '' } }); await waitFor(() => expect(list.dataset.buildrRecordCount).toBe('500'));
 expect(list.querySelectorAll('[data-buildr-record-selector][tabindex="0"]').length).toBe(1); expect(document.activeElement).toBe(search);
 list.scrollTop = 52 * 250 + 40; fireEvent.scroll(list);
 await waitFor(() => expect(Number(list.dataset.buildrFirstVisibleIndex)).toBe(250));
 const entry = list.querySelector<HTMLButtonElement>('[data-buildr-record-selector][tabindex="0"]')!;
 expect(entry.dataset.buildrRecordIndex).toBe('250'); expect(requests.length).toBe(1);
 const overscan = list.querySelector<HTMLButtonElement>('[data-buildr-record-index="246"]')!;
 fireEvent.focus(overscan); expect(overscan.tabIndex).toBe(-1);
 expect(list.querySelector<HTMLButtonElement>('[data-buildr-record-selector][tabindex="0"]')?.dataset.buildrRecordIndex).toBe('250');
});

it('closing after a small scroll ignores an offscreen selected row still mounted for overscan', async () => {
 const scene = await createScene(Array.from({ length: 500 }, (_, index) => contextNode(index + 1, sources('method-' + index))), async input => readySource(input, 'Saved body ' + input.record.eventRefs[0]!.seq));
 const { original, snapshot, requests } = scene;
 const firstId = snapshot.recordContexts[0]!.recordId, visibleId = snapshot.recordContexts[5]!.recordId;
 await clickRecord(original.container, firstId); await waitFor(() => expect(original.view.getByText('Saved body 1')).toBeTruthy());
 const list = original.container.querySelector<HTMLElement>('[data-buildr-record-count]')!;
 list.scrollTop = 40 + 5 * 52; fireEvent.scroll(list);
 await waitFor(() => expect(list.dataset.buildrFirstVisibleIndex).toBe('5'));
 expect(list.dataset.buildrWindowStart).toBe('0');
 const first = list.querySelector<HTMLButtonElement>('[data-buildr-record-index="0"]')!;
 expect(first.dataset.buildrRecordSelector).toBe(firstId); expect(first.getBoundingClientRect().bottom).toBeLessThan(list.getBoundingClientRect().top);
 const top = list.scrollTop; fireEvent.click(original.view.getByRole('button', { name: zh.sourceCloseDetails }));
 await waitFor(() => expect((document.activeElement as HTMLElement)?.dataset.buildrRecordSelector).toBe(visibleId));
 expect(original.container.querySelector('[data-buildr-record-count]')).toBe(list); expect(list.scrollTop).toBe(top); expect(requests.length).toBe(1);
 expect((document.activeElement as HTMLButtonElement).tabIndex).toBe(0);
 fireEvent.click(document.activeElement!); await waitFor(() => expect(original.view.getByText('Saved body 6')).toBeTruthy());
 expect(requests.length).toBe(2); expect(list.scrollTop).toBe(top);
});

it('recorded Markdown preview and raw text share the exact fragment without another content request', async () => {
 const body = '# Saved heading\n\n**Saved emphasis**\n\n- saved item\n\n```ts\nconst n = 1;\n```';
 const scene = await createScene([contextNode(1, sources('markdown method', { completeness: 'partial' }))], async input => readySource(input, body));
 await clickRecord(scene.original.container, scene.snapshot.recordContexts[0]!.recordId);
 await waitFor(() => expect(scene.original.view.getByRole('heading', { name: 'Saved heading' })).toBeTruthy());
 expect(scene.original.view.getByText(zh.sourceCapturedPartial)).toBeTruthy();
 expect(scene.original.container.querySelector('[data-content-view]')?.getAttribute('data-content-format')).toBe('markdown');
 fireEvent.click(scene.original.view.getByRole('button', { name: zh.sourceRaw, exact: true }));
 expect(scene.original.container.querySelector('[data-content-view] pre')?.textContent).toBe(body);
 fireEvent.click(scene.original.view.getByRole('button', { name: zh.sourcePreview, exact: true }));
 expect(scene.original.view.getByRole('heading', { name: 'Saved heading' })).toBeTruthy(); expect(scene.requests.length).toBe(1);
});

it('a Markdown renderer fault preserves the list, recorded source and raw-content control', async () => {
 const error = vi.spyOn(console, 'error').mockImplementation(() => {});
 markdownFailure.enabled = true;
 try {
  const scene = await createScene([contextNode(1)], async input => readySource(input, '# Exact original body'));
  await clickRecord(scene.original.container, scene.snapshot.recordContexts[0]!.recordId);
  await waitFor(() => expect(scene.original.view.getByText(zh.sourceMarkdownFailed)).toBeTruthy());
  expect(scene.original.container.querySelector('[data-buildr-record-count]')?.getAttribute('data-buildr-record-count')).toBe('1');
  fireEvent.click(scene.original.view.getByRole('button', { name: zh.sourceRaw, exact: true }));
  expect(scene.original.container.querySelector('[data-content-view] pre')?.textContent).toBe('# Exact original body'); expect(scene.requests.length).toBe(1);
 } finally { markdownFailure.enabled = false; error.mockRestore(); }
});


it('a rejected Client keeps diagnostics reachable and gates all business seats by the Host qualification', async () => {
 let active = false;
 const scene = await createScene([contextNode(1)], async input => readySource(input), 'trajectory', () => active
  ? { active: true, packageName: '@buildr-ai/buildr-dsh-plugin' }
  : { active: false, packageName: '@buildr-ai/buildr-dsh-plugin', code: 'plugin-conflict', ownerPackage: '@buildr-ai/buildr-dsh-plugin-dev', message: 'conflict' });
 const notice = scene.runtime.renderSlot('shell.overlay', {}, { only: 'buildr-compatibility' });
 await waitFor(() => expect(notice.view.getByText(zh.activationConflict)).toBeTruthy());
 for (const seat of ['sidebar.footer.action', 'conversation.trajectory.column', 'conversation.trajectory.inspector.objects', 'conversation.view'] as const) {
  expect(scene.runtime.slots.entries(seat).some(entry => entry.options.id?.startsWith('buildr'))).toBe(false);
 }
 expect(scene.requests).toEqual([]);
 active = true; scene.runtime.remote.emit('plugin-manager/changed', [{ reason: 'bundle' }]);
 await waitFor(() => expect(scene.runtime.slots.entries('conversation.view').some(entry => entry.options.id === 'buildr')).toBe(true));
 expect(notice.view.queryByText(zh.activationConflict)).toBeNull();
 await waitFor(() => expect(scene.original.container.querySelectorAll('col').length).toBe(3));
 expect(scene.requests).toEqual([]);
 // A management refresh cannot remount a healthy owner's components and lose its reader state.
 scene.runtime.remote.emit('plugin-manager/changed', [{ reason: 'plugin' }]);
 await waitFor(() => expect(scene.runtime.slots.entries('conversation.trajectory.column').filter(entry => entry.options.id === 'buildr-source')).toHaveLength(1));
 await act(() => scene.buildr.dispose());
 expect(scene.runtime.slots.entries('conversation.view').some(entry => entry.options.id === 'trajectory')).toBe(true);
 expect(scene.runtime.slots.entries('conversation.view').some(entry => entry.options.id === 'buildr')).toBe(false);
});
