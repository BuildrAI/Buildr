import fs from 'node:fs';
import path from 'node:path';

import { createGeneratedArtifactManifest } from '../../tools/build/generated-artifacts.ts';
import { buildTestContext } from '../../tools/testing/test-context-build.mjs';

export function createGeneratedReleaseInputs(root, sourceIdentity = 'fixture:generated-release-inputs') {
  const outputRoot = path.resolve(root);
  const webDistRoot = path.join(outputRoot, 'web-dist');
  const testContextRoot = path.join(outputRoot, 'test-context');
  fs.mkdirSync(path.join(webDistRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(webDistRoot, 'index.html'), '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>\n');
  fs.writeFileSync(path.join(webDistRoot, 'assets/index.js'), 'globalThis.__BUILDR_GENERATED_FIXTURE__ = true;\n');
  buildTestContext(testContextRoot);
  const manifest = createGeneratedArtifactManifest({
    inputs: { source: sourceIdentity },
    artifacts: [
      { id: 'test-context', root: testContextRoot },
      { id: 'web-dist', root: webDistRoot },
    ],
  });
  return { root: outputRoot, webDistRoot, testContextRoot, manifest };
}
