import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import { normalizeProjectVerification, parseProjectVerification, validateProjectVerification } from '../domain/project-verification.ts';

const digest = (value: Buffer | string) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;

export type ProjectTestingWorkspaceQuery = {
  projectDetail(root: string, code: string): { project: { code: string; source: { type?: string; path: string } } };
  listServices(root: string, projectCode: string): { services: Array<{ code: string }> };
  resolveSourceRoot(root: string, source: { type?: string; path: string }): string;
};

type ProjectVerificationFileMutations = Readonly<{
  atomicWriteFile(file: string, content: string): void;
}>;

function projectContext(workspaceQuery: ProjectTestingWorkspaceQuery, targetRoot: string, projectCode: string) {
  const root = fs.realpathSync(path.resolve(targetRoot));
  let detail;
  try {
    detail = workspaceQuery.projectDetail(root, projectCode);
  } catch (error: any) {
    if (error?.code !== 'project_not_found') throw error;
    throw Object.assign(new Error(`Project 未登记：${projectCode}。`), { code: 'project_verification_project_not_found', status: 404 });
  }
  const project = detail.project;
  const projectRoot = workspaceQuery.resolveSourceRoot(root, project.source);
  return { root, project, projectRoot, file: path.join(projectRoot, 'verification.yml') };
}

function result(operation: string, status: string, project: string, values: any = {}) {
  return {
    schemaVersion: 'buildr.project-verification-result/v1',
    operation,
    status,
    project,
    path: values.path || null,
    identity: values.identity || null,
    declaration: values.declaration || null,
    errors: values.errors || [],
    effects: values.effects || [],
  };
}

export function createProjectVerificationApplication(
  workspaceQuery: ProjectTestingWorkspaceQuery,
  mutations: ProjectVerificationFileMutations,
) {
  function inspectProjectVerification(targetRoot: string, projectCode: string) {
    const context = projectContext(workspaceQuery, targetRoot, projectCode);
    const relative = path.relative(context.root, context.file).split(path.sep).join('/');
    if (!fs.existsSync(context.file)) return result('inspect', 'missing', projectCode, { path: relative, identity: 'absent' });
    const content = fs.readFileSync(context.file);
    const value = parseProjectVerification(content.toString('utf8'), context.file);
    const services = workspaceQuery.listServices(context.root, projectCode).services.map((service) => service.code);
    const errors = validateProjectVerification(value, { projectCode, services });
    return result('inspect', errors.length ? 'invalid' : 'ready', projectCode, {
      path: relative,
      identity: digest(content),
      declaration: errors.length ? value : normalizeProjectVerification(value, { projectCode, services }),
      errors,
    });
  }

  function validateProjectVerificationCandidate(targetRoot: string, projectCode: string, file: string) {
    const context = projectContext(workspaceQuery, targetRoot, projectCode);
    const content = fs.readFileSync(path.resolve(file));
    const value = parseProjectVerification(content.toString('utf8'), file);
    const services = workspaceQuery.listServices(context.root, projectCode).services.map((service) => service.code);
    const errors = validateProjectVerification(value, { projectCode, services });
    return result('validate', errors.length ? 'invalid' : 'ready', projectCode, {
      path: path.resolve(file),
      identity: digest(content),
      declaration: errors.length ? value : normalizeProjectVerification(value, { projectCode, services }),
      errors,
    });
  }

  function updateProjectVerification(targetRoot: string, projectCode: string, file: string, expectedIdentity: string) {
    const context = projectContext(workspaceQuery, targetRoot, projectCode);
    const current = fs.existsSync(context.file) ? digest(fs.readFileSync(context.file)) : 'absent';
    if (current !== expectedIdentity) {
      throw Object.assign(new Error(`verification.yml 已变化：${expectedIdentity} -> ${current}。`), { code: 'project_verification_conflict', status: 409 });
    }
    const candidate = validateProjectVerificationCandidate(targetRoot, projectCode, file);
    if (candidate.status !== 'ready') {
      throw Object.assign(new Error(`verification.yml 候选无效：${candidate.errors.join('; ')}`), { code: 'project_verification_invalid', status: 400, details: { errors: candidate.errors } });
    }
    mutations.atomicWriteFile(context.file, YAML.stringify(candidate.declaration));
    const content = fs.readFileSync(context.file);
    const relative = path.relative(context.root, context.file).split(path.sep).join('/');
    return result('update', 'updated', projectCode, {
      path: relative,
      identity: digest(content),
      declaration: parseProjectVerification(content.toString('utf8'), context.file),
      effects: [{ type: current === 'absent' ? 'created' : 'updated', path: relative }],
    });
  }

  function createProjectVerificationDiagnostics({ addDoctorFinding }: { addDoctorFinding: (...args: any[]) => void }) {
    return {
      diagnoseProjectVerification(report: any, targetRoot: string, registry: any = null) {
        report.projectVerification = [];
        for (const projectCode of Object.keys(registry?.projects || {})) {
          let inspection;
          try {
            inspection = inspectProjectVerification(targetRoot, projectCode);
          } catch (error) {
            const context = projectContext(workspaceQuery, targetRoot, projectCode);
            inspection = result('inspect', 'invalid', projectCode, {
              path: path.relative(targetRoot, context.file).split(path.sep).join('/'),
              errors: [error instanceof Error ? error.message : String(error)],
            });
          }
          if (inspection.status === 'missing') continue;
          report.projectVerification.push({ project: projectCode, path: inspection.path, valid: inspection.status === 'ready', testingCount: inspection.declaration?.testing?.length || 0 });
          for (const message of inspection.errors) {
            addDoctorFinding(report, 'error', 'project.verification_invalid', message, {
              path: inspection.path,
              userActionRequired: true,
              suggestion: '使用 Task Verification Skill 探查项目测试体系，并通过 project verification validate/update 修复测试地图。',
            });
          }
        }
      },
    };
  }

  return Object.freeze({ inspectProjectVerification, validateProjectVerificationCandidate, updateProjectVerification, createProjectVerificationDiagnostics });
}
