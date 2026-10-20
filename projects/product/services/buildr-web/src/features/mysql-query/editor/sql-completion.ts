import { autocompletion, closeCompletion, completionKeymap, completionStatus, selectedCompletion, startCompletion, CompletionContext, type Completion, type CompletionResult } from '@codemirror/autocomplete';
import { isolateHistory } from '@codemirror/commands';
import { Prec, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap } from '@codemirror/view';
import { DatabaseCatalog } from './database-catalog';
import { sqlShortcutActions, type SqlShortcutAction } from './shortcut-actions';
import { quoteIdentifier, sqlCompletionContext } from './sql-context';

export type SqlCompletionScope = { catalog: DatabaseCatalog | null; database: string; databases: readonly string[]; enabled: boolean };
type SqlOption = Completion & { kind: 'edit' | 'notice' | 'retry' };
const notice = (label: string, detail: string): SqlOption => ({ label, detail, kind: 'notice', type: 'text', apply() {} });

function applyEdit(view: EditorView, from: number, to: number, insert: string, cursor = insert.length, next = false) {
  if (view.state.readOnly) return;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + cursor }, userEvent: 'input.complete', annotations: isolateHistory.of('full') });
  view.focus();
  if (next) queueMicrotask(() => { if (view.dom.isConnected && !view.state.readOnly) startCompletion(view); });
}
function confirm(view: EditorView, scope: SqlCompletionScope | null, actions: readonly SqlShortcutAction[], source: (context: CompletionContext) => CompletionResult | null) {
  if (view.state.readOnly || scope && !scope.enabled) return false;
  const status = completionStatus(view.state);
  // Confirm against the current document even while the popup is updating. With no open
  // completion, only an exact registered trigger may replace normal Enter/Tab editing.
  const target = sqlCompletionContext(view.state);
  if (!target) return false;
  if (status) {
    // Recompute through the same source: the popup may still contain an older filter result.
    const result = source(new CompletionContext(view.state, view.state.selection.main.head, true, view));
    const options = (result?.options ?? []) as readonly SqlOption[];
    const previous = selectedCompletion(view.state) as SqlOption | null;
    const eligible = status === 'pending' && target.kind === 'shortcut' ? options.filter(item => item.label.toLowerCase() === target.query.toLowerCase()) : options;
    const option = eligible.find(item => item.label === previous?.label && item.kind === previous.kind && item.type === previous.type) ?? eligible[0];
    if (!option || option.kind === 'notice' || typeof option.apply !== 'function') { closeCompletion(view); return false; }
    closeCompletion(view);
    option.apply(view, option, target.from, target.to);
    return true;
  }
  if (target.kind !== 'shortcut') return false;
  const action = actions.find(item => item.trigger.toLowerCase() === target.query.toLowerCase() && item.available(target));
  if (!action) return false;
  const plan = action.createPlan(target);
  closeCompletion(view);
  applyEdit(view, target.from, target.to, plan.insert, plan.cursor, Boolean(plan.next));
  return true;
}
const filtered = <T extends { label: string }>(options: T[], query: string) => options.filter(item => item.label.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.label.toLowerCase().startsWith(query.toLowerCase())) - Number(a.label.toLowerCase().startsWith(query.toLowerCase())));

/** All SQL edit operations share one adapter; an operation never owns keys or metadata requests. */
export function sqlCompletionExtension(scope: SqlCompletionScope | null, actions: readonly SqlShortcutAction[] = sqlShortcutActions): Extension {
  const source = (context: CompletionContext): CompletionResult | null => {
    if (context.state.readOnly || scope && !scope.enabled) return null;
    const target = sqlCompletionContext(context.state, context.pos); if (!target) return null;
    if (target.kind === 'shortcut') {
      const options: SqlOption[] = actions.filter(action => action.available(target) && action.trigger.toLowerCase().startsWith(target.query.toLowerCase())).map(action => ({
        label: action.trigger, detail: action.title, type: 'keyword', kind: 'edit',
        apply(view, _item, from, to) { const plan = action.createPlan(target); applyEdit(view, from, to, plan.insert, plan.cursor, Boolean(plan.next)); },
      }));
      return options.length ? { from: target.from, to: target.to, options, filter: false, update: (_result, _from, _to, next) => source(next) } : null;
    }
    const options: SqlOption[] = [];
    const database = target.database ?? scope?.database ?? '';
    const databases: SqlOption[] = target.database === undefined ? filtered((scope?.databases ?? []).filter(name => name !== scope?.database).map(name => ({
      label: name, detail: '数据库 · 进入选表', type: 'namespace', kind: 'edit' as const, section: { name: '其他已启用数据库', rank: 1 },
      apply(view: EditorView, _item: Completion, from: number, to: number) { applyEdit(view, from, to, quoteIdentifier(name) + '.', undefined, true); },
    })), target.query) : [];
    if (database && scope?.catalog) {
      const entry = scope.catalog.read(database);
      if (entry.status === 'ready') {
        options.push(...filtered(entry.tables.map(table => ({ label: table.name, detail: database, type: 'class', kind: 'edit' as const, section: { name: '表', rank: 0 },
          apply(view: EditorView, _item: Completion, from: number, to: number) { applyEdit(view, from, to, quoteIdentifier(table.name)); },
        })), target.query));
        if (!options.length && !databases.length) options.push(notice(target.query ? '没有匹配的表' : '此数据库没有可选的表', database));
      } else if (!target.query || !databases.length) {
        if (entry.status === 'loading') options.push(notice('正在读取表…', database));
        else options.push({ label: '读取失败，按回车重试', detail: database, info: entry.error, kind: 'retry', type: 'text',
          apply(view) { scope.catalog!.retry(database); closeCompletion(view); startCompletion(view); },
        });
      }
    } else if (!databases.length) options.push(notice('请先选择数据库', '在上方或左侧选择'));
    options.push(...databases);
    return { from: target.from, to: target.to, options, filter: false, update: (_result, _from, _to, next) => source(next) };
  };
  return [
    autocompletion({ override: [source], defaultKeymap: false, activateOnTypingDelay: 25, interactionDelay: 0, maxRenderedOptions: 30, tooltipClass: () => 'buildr-sql-completion' }),
    Prec.highest(keymap.of([{ key: 'Enter', run: view => confirm(view, scope, actions, source) }, { key: 'Tab', run: view => confirm(view, scope, actions, source) }, ...completionKeymap.filter(binding => binding.key !== 'Enter')])),
    ViewPlugin.define(view => {
      const unsubscribe = scope?.catalog?.subscribe(database => {
        if (!view.hasFocus || view.state.readOnly || !scope.enabled || completionStatus(view.state) === null) return;
        const target = sqlCompletionContext(view.state);
        if (target?.kind !== 'relation' || database && database !== (target.database ?? scope.database)) return;
        closeCompletion(view); startCompletion(view);
      });
      return { destroy() { unsubscribe?.(); } };
    }),
  ];
}
