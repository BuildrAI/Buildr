import fs from 'node:fs';
import path from 'node:path';

import { execFileSync } from '../../../../infrastructure/process.ts';
import { createScopeDiagnostics } from './scope-diagnostics.ts';
import { createServiceDiagnostics } from './service-diagnostics.ts';

export function createWorkspaceDiagnostics(runtime: any) {
  const call = (method: string) => (...args: any[]) => runtime[method](...args);
  const scope = createScopeDiagnostics({
    addDoctorFinding: call('addDoctorFinding'), execFileSync,
    existsDirectory: call('existsDirectory'), existsFile: call('existsFile'), fs,
    gitBoundaryFor: call('gitBoundaryFor'), gitBoundaryIgnored: call('gitBoundaryIgnored'), gitignoreLines: call('gitignoreLines'), gitOutput: call('gitOutput'),
    parseProjectsYaml: call('parseProjectsYaml'), parseYamlValue: call('parseYamlValue'), path, readGitRemote: call('readGitRemote'),
    projectsManifestPath: call('projectsManifestPath'), servicesManifestPath: call('servicesManifestPath'),
    toPosixRelative: call('toPosixRelative'), validateProjectsRegistry: call('validateProjectsRegistry'),
    buildrWorkspaceIdentity: call('buildrWorkspaceIdentity'), observeProjectGit: call('observeProjectGit'),
    sameGitIdentity: call('sameGitIdentity'), resolveSourceRoot: call('resolveSourceRoot'),
  });
  const service = createServiceDiagnostics({
    addDoctorFinding: call('addDoctorFinding'), existsDirectory: call('existsDirectory'), existsFile: call('existsFile'), fs,
    gitBoundaryFor: call('gitBoundaryFor'), gitBoundaryIgnored: call('gitBoundaryIgnored'), gitCurrentBranch: call('gitCurrentBranch'),
    gitignoreLines: scope.gitignoreLines, listManagedDirectories: call('listManagedDirectories'),
    parseServicesManifestYaml: call('parseServicesManifestYaml'), parseServicesManifest: call('parseServicesManifest'),
    path, projectDoctorContextFor: scope.projectDoctorContextFor, readGitRemote: scope.readGitRemote,
    toPosixRelative: call('toPosixRelative'), validateServicesManifest: call('validateServicesManifest'), resolveSourceRoot: call('resolveSourceRoot'),
  });
  return Object.freeze({ ...scope, ...service, diagnoseMutations: call('diagnoseMutations') });
}
