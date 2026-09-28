import { writeWorkbenchDto } from '../codegen/contracts/workbench-dto.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeRuntimeSystemDto } from '../codegen/contracts/runtime-system-dto.ts';
import { writeTaskProfessionalHttpDto } from '../codegen/contracts/task-professional-dto.ts';
import { writeTaskRecordHttpDto } from '../codegen/contracts/task-dto.ts';
import { writeWorkspaceAgentAssetsDtos } from '../codegen/contracts/workspace-agent-assets-dto.ts';
import { buildTestContext } from '../testing/test-context-build.ts';
import { createGeneratedArtifactManifest, type GeneratedArtifactManifest } from './generated-artifacts.ts';
import { buildWebDist } from './web-dist.ts';
import { assertUnboundDshPlugin } from '../dsh/plugin-artifact.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');

export const generatedArtifactManifestName = 'generated-artifacts.json';

export type GeneratedArtifactSet = {
  root: string;
  dtoRoot: string;
  testContextRoot: string;
  webDistRoot: string;
  dshPluginRoot?: string;
  manifestPath: string;
  manifest: GeneratedArtifactManifest;
};

const sha256File = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/**
 * The DSH plugin artifact a release candidate must carry.
 *
 * A release without it is a release whose plugin silently never shipped, so absence is an error
 * rather than a default. Excluding it is possible but must be stated: BUILDR_DSH_PLUGIN_EXCLUDE=1.
 * The artifact itself is built separately (tools/dsh/build-plugin.ts) because it needs a DSH SDK
 * checkout, which this build must not acquire on its own.
 */
export function resolveReleaseDshPluginRoot(
  environment: NodeJS.ProcessEnv = process.env,
  serviceRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
): string | undefined {
  const declared = environment.BUILDR_DSH_PLUGIN_ROOT?.trim();
  const candidate = declared ? path.resolve(declared) : path.join(serviceRoot, 'build/dsh-plugin');
  if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
  if (declared) throw new Error(`dsh_plugin_root_not_a_bundle: ${candidate} does not contain a package.json`);
  if (environment.BUILDR_DSH_PLUGIN_EXCLUDE === '1') return undefined;
  throw new Error(
    'dsh_plugin_artifact_missing: a release candidate must carry the DSH plugin artifact; '
    + 'build it with `node tools/dsh/fetch-sdk.ts` then `node tools/dsh/build-plugin.ts`, which writes '
    + `${candidate}, or state the exclusion with BUILDR_DSH_PLUGIN_EXCLUDE=1.`,
  );
}

export async function buildGeneratedArtifactSet(outputRoot: string, input: { sourceIdentity: string; dshPluginRoot?: string }): Promise<GeneratedArtifactSet> {
  const root = path.resolve(outputRoot);
  if (!input.sourceIdentity.trim()) throw new Error('generated_artifact_source_identity_missing');
  if (fs.existsSync(root)) throw new Error(`generated_artifact_output_exists: ${root}`);
  if (input.dshPluginRoot) assertUnboundDshPlugin(input.dshPluginRoot);
  fs.mkdirSync(root, { recursive: true });
  const dshPluginRoot = input.dshPluginRoot ? path.join(root, 'dsh-plugin') : undefined;
  const dtoRoot = path.join(root, 'dto');
  const testContextRoot = path.join(root, 'test-context');
  const webDistRoot = path.join(root, 'web-dist');
  try {
    // 暂存副本用于建立候选产物身份；忽略的本地副本来自同一次模式渲染，
    // 让 TypeScript 消费方能够从干净检出编译，且不读取陈旧或已跟踪的投射。
    await writeTaskRecordHttpDto(dtoRoot);
    await writeWorkbenchDto(dtoRoot);
    await writeTaskProfessionalHttpDto(dtoRoot);
    await writeRuntimeSystemDto(dtoRoot);
    await writeWorkspaceAgentAssetsDtos(dtoRoot);
    await writeTaskRecordHttpDto();
    await writeWorkbenchDto();
    await writeTaskProfessionalHttpDto();
    await writeRuntimeSystemDto();
    await writeWorkspaceAgentAssetsDtos();
    buildTestContext(testContextRoot);
    buildWebDist(webDistRoot);
    if (dshPluginRoot && input.dshPluginRoot) {
      fs.cpSync(input.dshPluginRoot, dshPluginRoot, { recursive: true, errorOnExist: true, force: false });
      assertUnboundDshPlugin(dshPluginRoot);
    }
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
        { id: 'backend-dto', root: path.join(dtoRoot, 'buildr/build/generated') },
        { id: 'web-dto', root: path.join(dtoRoot, 'buildr-web/build/generated') },
        { id: 'test-context', root: testContextRoot },
        { id: 'web-dist', root: webDistRoot },
        ...(dshPluginRoot ? [{ id: 'dsh-plugin', root: dshPluginRoot }] : []),
      ],
    });
    const manifestPath = path.join(root, generatedArtifactManifestName);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
    return { root, dtoRoot, testContextRoot, webDistRoot, ...(dshPluginRoot ? { dshPluginRoot } : {}), manifestPath, manifest };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
