import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const releaseEnvironmentBindingSchema = 'buildr.release-environment-binding/v1';

const digest = (value) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;

function requiredDigest(value, field) {
  if (!/^sha256-[a-f0-9]{64}$/u.test(value || '')) throw new Error(`${field} must be a sha256 identity.`);
  return value;
}

function closed(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const field of Object.keys(value)) if (!fields.includes(field)) throw new Error(`${label}.${field} is not supported.`);
  return value;
}

export function validateReleaseEnvironmentBinding(value, options = {}) {
  closed(value, ['schemaVersion', 'taskId', 'environmentStatus', 'sourceCommit', 'service', 'serviceRoot', 'planIdentity', 'declarationIdentity', 'recipe', 'inputs', 'node', 'identity'], 'release environment binding');
  if (value.schemaVersion !== releaseEnvironmentBindingSchema) throw new Error('Release environment binding schema is invalid.');
  if (!/^[a-f0-9]{40}$/u.test(value.sourceCommit || '')) throw new Error('Release environment sourceCommit must be a full Git SHA.');
  if (value.environmentStatus !== 'ready' && value.environmentStatus !== 'cleaned') throw new Error('Release environment status must be ready or cleaned.');
  if (value.service !== 'product/buildr' || value.serviceRoot !== 'projects/product/services/buildr') throw new Error('Release environment must bind product/buildr Service root.');
  requiredDigest(value.planIdentity, 'Release environment plan identity');
  requiredDigest(value.declarationIdentity, 'Release environment declaration identity');
  closed(value.recipe, ['id', 'identity', 'stepId'], 'release environment recipe');
  if (value.recipe.id !== 'service:product/buildr/buildr.npm-ci' || value.recipe.stepId !== 'service:product/buildr/buildr.npm-ci/npm-ci') throw new Error('Release environment recipe is not the Buildr Service npm-ci recipe.');
  requiredDigest(value.recipe.identity, 'Release environment recipe identity');
  closed(value.inputs, ['package.json', 'package-lock.json'], 'release environment inputs');
  for (const name of ['package.json', 'package-lock.json']) requiredDigest(value.inputs[name], `Release environment ${name} identity`);
  closed(value.node, ['authority', 'version', 'executionIdentity'], 'release environment Node');
  if (value.node.authority !== 'projects/product/.node-version' || !/^\d+\.\d+\.\d+$/u.test(value.node.version || '')) throw new Error('Release environment Node authority/version is invalid.');
  requiredDigest(value.node.executionIdentity, 'Release environment Node execution identity');
  const { identity, ...withoutIdentity } = value;
  const actualIdentity = `sha256-${crypto.createHash('sha256').update(JSON.stringify(withoutIdentity)).digest('hex')}`;
  if (identity !== actualIdentity) throw new Error(`Release environment binding identity mismatch: ${identity} != ${actualIdentity}.`);
  if (options.repo) {
    const repo = path.resolve(options.repo);
    for (const name of ['package.json', 'package-lock.json']) {
      const file = path.join(repo, value.serviceRoot, name);
      if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error(`Release environment source is missing ${value.serviceRoot}/${name}.`);
      const currentIdentity = digest(fs.readFileSync(file));
      if (currentIdentity !== value.inputs[name]) throw new Error(`Release environment source drift for ${name}: ${value.inputs[name]} != ${currentIdentity}.`);
    }
    const nodeVersionFile = path.join(repo, 'projects/product/.node-version');
    if (!fs.statSync(nodeVersionFile, { throwIfNoEntry: false })?.isFile() || fs.readFileSync(nodeVersionFile, 'utf8').trim() !== value.node.version) throw new Error('Release environment source Node version does not match projects/product/.node-version.');
  }
  return value;
}

export function createReleaseEnvironmentBinding({ task, environmentResult, repo, sourceCommit, readSourceFile, nodeAudit }) {
  if (task?.status !== 'completed') throw new Error(`Release Task must be completed before publication: ${task?.taskId || '<missing>'}.`);
  if (!['cleaned', 'ready'].includes(environmentResult?.status)) throw new Error(`Release Task Environment must be ready or cleaned: ${environmentResult?.status || '<missing>'}.`);
  const environment = environmentResult.environment;
  const plan = environment?.preparationPlan;
  requiredDigest(plan?.identity, 'Task Environment Plan identity');
  const scope = environment?.preparationScopes?.find((item) => item.selector === 'service:product/buildr');
  if (scope?.status !== 'ready' || !scope.recipeIds?.includes('service:product/buildr/buildr.npm-ci')) {
    throw new Error('Release Task Environment is missing ready service:product/buildr/buildr.npm-ci preparation.');
  }
  const recipe = environment?.preparationRecipes?.find((item) => item.id === 'service:product/buildr/buildr.npm-ci');
  if (recipe?.status !== 'ready') throw new Error('Release Task Environment buildr.npm-ci recipe is not ready.');
  requiredDigest(recipe.identity, 'Release preparation recipe identity');
  const step = environment?.preparationSteps?.find((item) => item.id === 'service:product/buildr/buildr.npm-ci/npm-ci');
  if (step?.status !== 'ready') throw new Error('Release Task Environment npm-ci step is not ready.');
  const expectedCwd = path.join(path.resolve(repo), 'projects', 'product', 'services', 'buildr');
  const serviceScope = environment?.scopes?.find((item) => item.selector === 'service:product/buildr');
  if (serviceScope?.sourcePath !== 'projects/product/services/buildr' || path.resolve(serviceScope.executionRoot || '') !== path.resolve(step.cwd || '')) {
    throw new Error(`Release preparation cwd must be the Task Environment product/buildr Service execution root, actual ${step.cwd || '<missing>'}.`);
  }
  if (!fs.statSync(path.join(expectedCwd, 'package-lock.json'), { throwIfNoEntry: false })?.isFile()) throw new Error('Release preparation requires the Buildr Service package-lock.json.');
  const inputs = new Map((step.inputs ?? []).map((item) => [path.basename(item.path || ''), item]));
  const sourceInputs = {};
  for (const name of ['package.json', 'package-lock.json']) {
    const prepared = inputs.get(name);
    if (!prepared) throw new Error(`Release preparation receipt is missing ${name}.`);
    const bytes = readSourceFile(sourceCommit, `projects/product/services/buildr/${name}`);
    const sourceIdentity = digest(bytes);
    if (sourceIdentity !== prepared.identity || sourceIdentity !== prepared.preparedIdentity) {
      throw new Error(`Release preparation input drift for ${name}: expected ${prepared.preparedIdentity}, source ${sourceIdentity}.`);
    }
    sourceInputs[name] = sourceIdentity;
  }
  const nodeVersion = String(readSourceFile(sourceCommit, 'projects/product/.node-version')).trim();
  if (nodeAudit?.version !== nodeVersion) throw new Error(`Release runner Node ${nodeAudit?.version || '<missing>'} does not match Task Environment project Node ${nodeVersion || '<missing>'}.`);
  requiredDigest(nodeAudit?.identity, 'Release Node execution identity');
  const value = {
    schemaVersion: releaseEnvironmentBindingSchema,
    taskId: task.taskId,
    environmentStatus: environmentResult.status,
    sourceCommit,
    service: 'product/buildr',
    serviceRoot: 'projects/product/services/buildr',
    planIdentity: plan.identity,
    declarationIdentity: requiredDigest(environment.preparationDeclarations?.find((item) => item.project === 'product')?.preparedIdentity, 'Release preparation declaration identity'),
    recipe: { id: recipe.id, identity: recipe.identity, stepId: step.id },
    inputs: sourceInputs,
    node: { authority: 'projects/product/.node-version', version: nodeVersion, executionIdentity: nodeAudit.identity },
  };
  value.identity = `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
  return validateReleaseEnvironmentBinding(value);
}
