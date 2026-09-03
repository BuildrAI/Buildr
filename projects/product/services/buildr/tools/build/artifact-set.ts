import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { writeRuntimeSystemDto } from '../contracts/runtime-system-dto.ts';
import { writeTaskProfessionalHttpDto } from '../contracts/task-professional-dto.ts';
import { writeTaskRecordHttpDto } from '../contracts/task-record-dto.ts';
import { writeWorkspaceAgentAssetsDtos } from '../contracts/workspace-agent-assets-dto.ts';
import { buildTestContext } from '../testing/test-context-build.ts';
import { createGeneratedArtifactManifest, type GeneratedArtifactManifest } from './generated-artifacts.ts';
import { buildWebDist } from './web-dist.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');

export const generatedArtifactManifestName = 'generated-artifacts.json';

export type GeneratedArtifactSet = {
  root: string;
  dtoRoot: string;
  testContextRoot: string;
  webDistRoot: string;
  manifestPath: string;
  manifest: GeneratedArtifactManifest;
};

const sha256File = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export async function buildGeneratedArtifactSet(outputRoot: string, input: { sourceIdentity: string }): Promise<GeneratedArtifactSet> {
  const root = path.resolve(outputRoot);
  if (!input.sourceIdentity.trim()) throw new Error('generated_artifact_source_identity_missing');
  if (fs.existsSync(root)) throw new Error(`generated_artifact_output_exists: ${root}`);
  fs.mkdirSync(root, { recursive: true });
  const dtoRoot = path.join(root, 'dto');
  const testContextRoot = path.join(root, 'test-context');
  const webDistRoot = path.join(root, 'web-dist');
  try {
    // 暂存副本用于建立候选产物身份；忽略的本地副本来自同一次模式渲染，
    // 让 TypeScript 消费方能够从干净检出编译，且不读取陈旧或已跟踪的投射。
    await writeTaskRecordHttpDto(dtoRoot);
    await writeTaskProfessionalHttpDto(dtoRoot);
    await writeRuntimeSystemDto(dtoRoot);
    await writeWorkspaceAgentAssetsDtos(dtoRoot);
    await writeTaskRecordHttpDto();
    await writeTaskProfessionalHttpDto();
    await writeRuntimeSystemDto();
    await writeWorkspaceAgentAssetsDtos();
    buildTestContext(testContextRoot);
    buildWebDist(webDistRoot);
    const buildrMetadata = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> };
    const webMetadata = JSON.parse(fs.readFileSync(path.join(productRoot, 'services/buildr-web/package.json'), 'utf8')) as { devDependencies?: Record<string, string> };
    const manifest = createGeneratedArtifactManifest({
      inputs: {
        source: input.sourceIdentity,
        buildrLock: sha256File(path.join(serviceRoot, 'package-lock.json')),
        buildrWebLock: sha256File(path.join(productRoot, 'services/buildr-web/package-lock.json')),
        typescript: buildrMetadata.devDependencies?.typescript ?? 'missing',
        webTypescript: webMetadata.devDependencies?.typescript ?? 'missing',
        vite: webMetadata.devDependencies?.vite ?? 'missing',
      },
      artifacts: [
        { id: 'backend-dto', root: path.join(dtoRoot, 'buildr/src') },
        { id: 'web-dto', root: path.join(dtoRoot, 'buildr-web/src') },
        { id: 'test-context', root: testContextRoot },
        { id: 'web-dist', root: webDistRoot },
      ],
    });
    const manifestPath = path.join(root, generatedArtifactManifestName);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
    return { root, dtoRoot, testContextRoot, webDistRoot, manifestPath, manifest };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
