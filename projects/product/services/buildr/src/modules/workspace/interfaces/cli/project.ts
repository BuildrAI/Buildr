import path from 'node:path';
import process from 'node:process';

import type { ProjectCreationInput } from '../../application/project-application.ts';
import { parseCliArguments } from './cli-arguments.ts';

export type ProjectCreationCliApplication = { createProjectAsset(input: ProjectCreationInput): any };

function printResult(result: any) {
  console.log(`${result.operation === 'attach' ? 'Attached' : 'Created'} project ${result.project}`);
  if (result.created.length) {
    console.log('Created:');
    for (const file of result.created) console.log(`  ${file}`);
  }
  if (result.changed.length) {
    console.log('Updated:');
    for (const file of result.changed) console.log(`  ${file}`);
  }
  for (const action of result.nextActions) console.log(`Next: ${action}`);
}

export function projectCreateCommand(application: ProjectCreationCliApplication, args: string[]) {
  const parsed = parseCliArguments(args, new Set(['--target', '--repo', '--attach', '--name', '--title', '--description', '--remote', '--integration-branch']));
  if (parsed.positions.length !== 1) throw new Error('Missing project ref');
  const parts = parsed.positions[0].split('/').filter(Boolean);
  if (parts.length !== 1) throw new Error(`Project ref must be <project>. Organization-prefixed refs are not supported: ${parsed.positions[0]}`);
  const input: ProjectCreationInput = {
    targetRoot: path.resolve(parsed.one('--target') || process.cwd()),
    project: parts[0],
    repoRef: parsed.one('--repo'),
    attachRef: parsed.one('--attach'),
    name: parsed.one('--name') || parsed.one('--title'),
    description: parsed.one('--description'),
    remote: parsed.one('--remote') || 'origin',
    remoteExplicit: parsed.has('--remote'),
    integrationBranch: parsed.one('--integration-branch'),
  };
  const result = application.createProjectAsset(input);
  printResult(result);
  return result;
}
