import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnCommandSync } from '../../../projects/product/services/buildr/src/infrastructure/process.ts';
import { buildApplicationPayload } from './application-payload.ts';
import { createReleaseArtifact, readReleaseArtifact } from './release-artifact.ts';

export const CANDIDATE_TARBALL_ENV: any = 'BUILDR_CANDIDATE_TARBALL';
export const CANDIDATE_PACK_METADATA_ENV: any = 'BUILDR_CANDIDATE_PACK_METADATA';
export const CANDIDATE_RELEASE_MANIFEST_ENV: any = 'BUILDR_CANDIDATE_RELEASE_MANIFEST';

function parsePackMetadata(metadataPath: any): any  {
  let payload: any;
  try {
    payload = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error: any) {
    throw new Error(`candidate pack metadata is invalid: ${error.message}`);
  }
  if (!Array.isArray(payload) || payload.length !== 1 || typeof payload[0]?.filename !== 'string' || !Array.isArray(payload[0]?.files)) {
    throw new Error('candidate pack metadata must contain exactly one npm pack result with files');
  }
  return payload[0];
}

export function readSharedCandidatePackage(env: any = process.env): any  {
  const tarballValue: any = env[CANDIDATE_TARBALL_ENV];
  const metadataValue: any = env[CANDIDATE_PACK_METADATA_ENV];
  const manifestValue: any = env[CANDIDATE_RELEASE_MANIFEST_ENV];
  if (!tarballValue && !metadataValue && !manifestValue) return null;
  if (!tarballValue || !metadataValue) throw new Error('shared candidate package requires both tarball and pack metadata');

  const tarball: any = path.resolve(tarballValue);
  const metadataPath: any = path.resolve(metadataValue);
  if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) throw new Error(`shared candidate tarball is missing: ${tarball}`);
  if (!fs.statSync(metadataPath, { throwIfNoEntry: false })?.isFile()) throw new Error(`shared candidate pack metadata is missing: ${metadataPath}`);
  const metadata: any = parsePackMetadata(metadataPath);
  if (path.basename(tarball) !== metadata.filename) throw new Error('shared candidate tarball filename does not match pack metadata');
  if (!manifestValue) return { tarball, metadataPath, metadata };
  const artifact: any = readReleaseArtifact(manifestValue, {
    packageName: metadata.name,
    version: metadata.version,
  });
  if (artifact.tarball !== tarball) throw new Error('shared candidate release manifest does not bind the candidate tarball');
  return { tarball, metadataPath, metadata, manifestPath: artifact.manifestPath, manifest: artifact.manifest };
}

export async function createCandidatePackage(productRoot: any, destination: any, options: any = {}): Promise<any>  {
  const stages: any[] = [];
  const observe = async (id: string, run: () => any) => {
    const start = performance.now();
    try { const result = await run(); stages.push({ id, status: 'passed', durationMs: Math.round(performance.now() - start) }); return result; }
    catch (error) { stages.push({ id, status: 'failed', durationMs: Math.round(performance.now() - start) }); throw error; }
    finally { options.observeStages?.(stages); }
  };
  const {prepareDevelopmentAgent} = await import('../../../projects/product/services/buildr/tools/development/prepare-development-agent.ts');
  await observe('prepare-agent', () => prepareDevelopmentAgent({serviceRoot:productRoot}));
  const { buildGeneratedArtifactSet }: any = await import('../../../projects/product/services/buildr/tools/build/artifact-set.ts');
  const npmExecutable: any = options.npmExecutable ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  fs.mkdirSync(destination, { recursive: true });
  const source: any = spawnCommandSync('git', ['rev-parse', 'HEAD'], {
    cwd: productRoot,
    encoding: 'utf8',
  });
  if (source.status !== 0 || !/^[a-f0-9]{40,64}$/.test(source.stdout.trim())) {
    throw new Error(`candidate source commit is unavailable: ${(source.stderr || source.stdout || '').trim()}`);
  }
  const generated: any = await observe('generated-artifacts', () => buildGeneratedArtifactSet(path.join(destination, 'generated-artifacts'), { sourceIdentity: source.stdout.trim(), observe: (value: any) => { stages.push(value); options.observeStages?.(stages); } }));
  const payload: any = await observe('backend-payload', () => buildApplicationPayload(path.join(destination, 'application-payload'), source.stdout.trim(), {
    generatedArtifactManifest: generated.manifest,
    webDistRoot: generated.webDistRoot,
    agentPrepared: true,
  }));
  const artifact: any = await observe('package-total', () => createReleaseArtifact(payload.root, destination, { npmExecutable, testContextRoot: generated.testContextRoot, observe: (value: any) => { stages.push(value); options.observeStages?.(stages); } }));
  const metadata: any = parsePackMetadata(artifact.packMetadataPath);
  return {
    tarball: artifact.tarball,
    metadataPath: artifact.packMetadataPath,
    metadata,
    manifestPath: artifact.manifestPath,
    manifest: artifact.manifest,
    payloadRoot: payload.root,
    payloadManifest: payload.manifest,
    generatedArtifactManifest: generated.manifest,
    measurements: { stages, package: artifact.packageMeasurements ? { ...artifact.packageMeasurements, backendBundleDependencies: payload.bundledDependencies } : null },
    stdout: '',
    stderr: '',
  };
}
