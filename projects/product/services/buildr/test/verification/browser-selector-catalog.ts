/** Shared selector identity; importing it never loads the execution graph. */
export const BROWSER_SELECTORS: any = Object.freeze(['core', 'shell', 'workbench', 'project', 'service', 'change', 'task', 'task-materials', 'articles', 'layout', 'code-explorer', 'code', 'connection-skills', 'agent-conversations']);

/** Selectors that can share one real browser host without sharing mutable
 * fixture state. Each bundle is one process, one server and one browser. */
export const BROWSER_BUNDLES: any = Object.freeze([
  Object.freeze({ id: 'reading', selectors: Object.freeze(['core', 'shell', 'workbench', 'change']) }),
  Object.freeze({ id: 'task-records', selectors: Object.freeze(['task', 'task-materials']) }),
]);
