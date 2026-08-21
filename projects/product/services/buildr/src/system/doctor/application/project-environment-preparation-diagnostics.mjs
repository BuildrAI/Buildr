import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import {
  normalizeProjectEnvironmentPreparation,
  parseProjectEnvironmentPreparation,
} from '../../../task/domain/project-environment-preparation.mjs';

function serviceCodes(projectRoot) {
  const file = path.join(projectRoot, 'services', 'manifest.yml');
  if (!fs.existsSync(file)) return [];
  try {
    const value = YAML.parse(fs.readFileSync(file, 'utf8'));
    return value?.services && typeof value.services === 'object' && !Array.isArray(value.services) ? Object.keys(value.services) : [];
  } catch {
    return [];
  }
}

export function createProjectEnvironmentPreparationDiagnostics({ addDoctorFinding }) {
  function diagnoseProjectEnvironmentPreparation(result, targetRoot, registry = null) {
    result.projectEnvironmentPreparation = [];
    for (const [projectCode, project] of Object.entries(registry?.projects || {})) {
      const projectRoot = path.resolve(targetRoot, project.source.path);
      const declarationPath = path.join(projectRoot, 'preparation.yml');
      if (!fs.existsSync(declarationPath)) continue;
      const relativePath = path.relative(targetRoot, declarationPath).split(path.sep).join('/');
      try {
        const declaration = normalizeProjectEnvironmentPreparation(
          parseProjectEnvironmentPreparation(fs.readFileSync(declarationPath, 'utf8'), relativePath),
          { projectCode, services: serviceCodes(projectRoot) },
        );
        result.projectEnvironmentPreparation.push({
          project: projectCode,
          path: relativePath,
          valid: true,
          recipeCount: declaration.recipes.length,
          identity: declaration.identity,
        });
      } catch (error) {
        result.projectEnvironmentPreparation.push({ project: projectCode, path: relativePath, valid: false, recipeCount: 0, identity: null });
        addDoctorFinding(result, 'error', 'project.environment_preparation_invalid', error.message, {
          path: relativePath,
          userActionRequired: true,
          suggestion: '修复 Project preparation.yml；Task Environment不会执行无效Recipe。',
        });
      }
    }
  }
  return { diagnoseProjectEnvironmentPreparation };
}
