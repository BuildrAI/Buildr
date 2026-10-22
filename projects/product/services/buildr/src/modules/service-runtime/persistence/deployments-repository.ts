import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import type { DeploymentRecord } from '../domain/deployment.ts';
import { serviceRuntimeRoot } from './runs-repository.ts';

export type DeploymentStateFile = {
  schemaVersion: 'buildr.service-deployment-state/v1';
  serviceCode: string;
  latest: Record<string, DeploymentRecord>;
};

export function deploymentStatePath(targetRoot: string, serviceCode: string): string {
  return path.join(serviceRuntimeRoot(targetRoot), 'deployments', `${serviceCode}.json`);
}

export function readDeploymentState(targetRoot: string, serviceCode: string): DeploymentStateFile {
  const file = deploymentStatePath(targetRoot, serviceCode);
  if (!fs.existsSync(file)) return { schemaVersion: 'buildr.service-deployment-state/v1', serviceCode, latest: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as DeploymentStateFile;
    return parsed && parsed.latest && typeof parsed.latest === 'object' ? parsed : { schemaVersion: 'buildr.service-deployment-state/v1', serviceCode, latest: {} };
  } catch {
    return { schemaVersion: 'buildr.service-deployment-state/v1', serviceCode, latest: {} };
  }
}

export function readLatestDeployment(targetRoot: string, serviceCode: string, environment: string): DeploymentRecord | null {
  return readDeploymentState(targetRoot, serviceCode).latest[environment] ?? null;
}

export async function writeDeploymentRecord(targetRoot: string, record: DeploymentRecord): Promise<DeploymentStateFile> {
  const state = readDeploymentState(targetRoot, record.serviceCode);
  const next: DeploymentStateFile = { ...state, schemaVersion: 'buildr.service-deployment-state/v1', serviceCode: record.serviceCode, latest: { ...state.latest, [record.environment]: record } };
  const file = deploymentStatePath(targetRoot, record.serviceCode);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await atomicWriteJson(file, next);
  return next;
}
