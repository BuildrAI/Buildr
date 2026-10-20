import type { SqlCompletionContext } from './sql-context';

export type SqlEditPlan = { insert: string; cursor: number; next?: 'relation' };
export type SqlShortcutAction = {
  id: string; trigger: string; title: string;
  available(context: SqlCompletionContext): boolean;
  createPlan(context: SqlCompletionContext): SqlEditPlan;
};

/** New edit shortcuts register here; key handling, metadata and execution belong to their existing owners. */
export const sqlShortcutActions: readonly SqlShortcutAction[] = [{
  id: 'select-all', trigger: 'sel', title: '查询整张表',
  available: context => context.kind === 'shortcut',
  createPlan: context => ({ insert: 'SELECT *\nFROM ' + (context.terminated ? '' : ';'), cursor: 'SELECT *\nFROM '.length, next: 'relation' }),
}];
