import { AGENT_ASSETS_SOURCE_READ } from '../module.ts';
import { WORKSPACE_QUERY } from '../../workspace/module.ts';
import { TASK_BRIEF_QUERY } from '../../task/module.ts';
import { TASK_MATERIALS_APPLICATION } from '../../task/materials/module.ts';
import { createSourceQuery, type SourceQueryDependencies } from '../application/source-query.ts';
import { createSourceInspectCli } from '../interfaces/cli/source-inspect.ts';

export const AGENT_ASSETS_SOURCE_QUERY = 'agent-assets.source-query';
/** Public source observation reader composed only from existing read applications. */
export const AGENT_ASSETS_SOURCE_MODULE = Object.freeze({
  id: 'agent-assets-source',
  requires: Object.freeze([AGENT_ASSETS_SOURCE_READ, WORKSPACE_QUERY, TASK_BRIEF_QUERY, TASK_MATERIALS_APPLICATION]),
  create(requires: {
    [AGENT_ASSETS_SOURCE_READ]: SourceQueryDependencies['assets'];
    [WORKSPACE_QUERY]: SourceQueryDependencies['workspace'];
    [TASK_BRIEF_QUERY]: SourceQueryDependencies['task'];
    [TASK_MATERIALS_APPLICATION]: SourceQueryDependencies['materials'];
  }) {
    const application = createSourceQuery({ assets: requires[AGENT_ASSETS_SOURCE_READ], workspace: requires[WORKSPACE_QUERY], task: requires[TASK_BRIEF_QUERY], materials: requires[TASK_MATERIALS_APPLICATION] });
    return Object.freeze({ provides: { [AGENT_ASSETS_SOURCE_QUERY]: application }, contributions: { cli: [createSourceInspectCli(application)] } });
  },
});
