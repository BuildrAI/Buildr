import process from 'node:process';
import path from 'node:path';

import { assertNoUnknownOptions, optionValue, positionalArgs } from '../../../../infrastructure/cli-arguments.ts';

type ProjectVerificationApplication = {
  inspectProjectVerification(targetRoot: string, projectCode: string): any;
  validateProjectVerificationCandidate(targetRoot: string, projectCode: string, file: string): any;
  updateProjectVerification(targetRoot: string, projectCode: string, file: string, expectedIdentity: string): any;
};

function parseArgs(operation: string, args: string[]) {
  const allowed = operation === 'inspect'
    ? new Set(['--target', '--json'])
    : operation === 'validate'
      ? new Set(['--file', '--target', '--json'])
      : new Set(['--file', '--expected-identity', '--target', '--json']);
  assertNoUnknownOptions(args, allowed, new Set(['--json']));
  const positions = positionalArgs(args, new Set(['--json']));
  if (positions.length !== 1) throw new Error(`project verification ${operation} requires exactly one <project>.`);
  return {
    project: positions[0],
    targetRoot: path.resolve(optionValue(args, '--target', process.cwd())),
    file: optionValue(args, '--file', undefined),
    expectedIdentity: optionValue(args, '--expected-identity', undefined),
    json: args.includes('--json'),
  };
}

export function projectVerificationCommand(application: ProjectVerificationApplication, operation: string, args: string[]) {
  const input = parseArgs(operation, args);
  const payload = operation === 'inspect'
    ? application.inspectProjectVerification(input.targetRoot, input.project)
    : operation === 'validate'
      ? application.validateProjectVerificationCandidate(input.targetRoot, input.project, input.file)
      : application.updateProjectVerification(input.targetRoot, input.project, input.file, input.expectedIdentity);
  if (input.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else console.log(`Project ${payload.project} verification ${payload.status}.`);
  if (payload.status === 'invalid') process.exitCode = 1;
  return payload;
}
