import path from 'node:path';
import process from 'node:process';

import type { ServiceCreationInput } from '../../application/service-creation-application.ts';
import { parseCliArguments } from './cli-arguments.ts';

export type ServiceCreationCliApplication = { createServiceAsset(input: ServiceCreationInput): any };

function printProjectResult(result: any) {
  if (!result) return;
  console.log(`${result.operation === 'attach' ? 'Attached' : 'Created'} project ${result.project}`);
  if (result.created.length) { console.log('Created:'); for (const file of result.created) console.log(`  ${file}`); }
  if (result.changed.length) { console.log('Updated:'); for (const file of result.changed) console.log(`  ${file}`); }
  for (const action of result.nextActions) console.log(`Next: ${action}`);
}

function printServiceResult(result: any, project: string, service: string) {
  if (result.warning) console.error(result.warning);
  if (result.projectResult) printProjectResult(result.projectResult);
  if (result.json) {
    const { projectResult, warning, json, ...payload } = result;
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`${result.service?.source?.root === 'attached' ? 'Attached' : 'Created'} service ${project}/${service}`);
  if (result.changed.length) { console.log('Updated:'); for (const file of result.changed) console.log(`  ${file}`); }
  for (const action of result.nextActions) console.log(`Next: ${action}`);
}

export function serviceCreateCommand(application: ServiceCreationCliApplication, args: string[]) {
  const allowed = new Set(['--target', '--attach', '--name', '--title', '--description', '--type', '--rules', '--branch', '--integration-branch', '--remote', '--json']);
  const parsed = parseCliArguments(args, allowed, new Set(['--json']));
  if (!parsed.positions[0]) throw new Error('Missing service ref');
  if (!parsed.positions[1] && !parsed.one('--attach')) throw new Error('Missing repo ref or --attach path');
  if (parsed.positions.length > 2) throw new Error('Service create accepts only <project>/<service> and one repo ref.');
  const parts = parsed.positions[0].split('/').filter(Boolean);
  if (parts.length !== 2) throw new Error(`Service ref must be <project>/<service>. Organization-prefixed refs are not supported: ${parsed.positions[0]}`);
  const input: ServiceCreationInput = {
    targetRoot: path.resolve(parsed.one('--target') || process.cwd()),
    project: parts[0],
    service: parts[1],
    repoRef: parsed.positions[1] || null,
    attachRef: parsed.one('--attach'),
    name: parsed.one('--name') || parsed.one('--title'),
    description: parsed.one('--description'),
    type: parsed.one('--type'),
    rulesSource: parsed.one('--rules'),
    integrationBranch: parsed.one('--integration-branch') || parsed.one('--branch'),
    remote: parsed.one('--remote') || 'origin',
    remoteExplicit: parsed.has('--remote'),
    json: parsed.has('--json'),
  };
  const result = { ...application.createServiceAsset(input), json: input.json };
  printServiceResult(result, input.project, input.service);
  return result;
}
