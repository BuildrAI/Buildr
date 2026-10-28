import path from 'node:path';
import { withAgentDataOffline } from '@buildr-ai/buildr-agent';

import type { PreviewReuseFacet } from './preview-reuse.ts';
import { assertWithinRoot, pathExists, replacePreviewDirectory } from './preview-reuse-files.ts';

export const MODEL_CATALOG_FACET = 'model-catalog';

export function createModelCatalogFacet(): PreviewReuseFacet {
  return {
    id: MODEL_CATALOG_FACET,
    label: '模型目录',
    sensitivity: 'metadata',
    defaultFor: true,
    ownership: ['agent-service/model-access'],
    async apply(input) {
      const source = path.join(input.sourceRoot, 'agent-service', 'model-access');
      if (!pathExists(source)) {
        return { status: 'failed', files: 0, bytes: 0, diagnostics: ['模型目录失败：来源缺少 model-access'], changedAt: input.now() };
      }
      const target = path.join(input.previewRoot, 'agent-service', 'model-access');
      assertWithinRoot(input.previewRoot, target);
      const current = pathExists(target);
      try {
        const result = withAgentDataOffline(input.previewRoot, () => replacePreviewDirectory({ source, target, refresh: input.refresh }));
        return {
          status: result.replaced ? 'refreshed' : current ? 'reused' : 'seeded',
          files: result.stats.files,
          bytes: result.stats.bytes,
          diagnostics: [],
          changedAt: input.now(),
        };
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'copy_failed';
        return { status: 'failed', files: 0, bytes: 0, diagnostics: [`模型目录失败：${code}`], changedAt: input.now() };
      }
    },
  };
}
