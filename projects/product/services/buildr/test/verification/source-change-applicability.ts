import { execFileSync } from 'node:child_process';

import {
  VERIFICATION_GOVERNED_REPOSITORY_INPUTS,
  isVerificationGovernedRepositoryInput,
  verificationStepOwnership,
} from './ownership.ts';
import { matchesInput } from './planner.ts';
import { verificationInputApplicability, type VerificationInputIdentity } from './result-applicability.ts';

const BUILDR_PREFIX = 'projects/product/services/buildr/';
const PRODUCT_PREFIX = 'projects/product/';
const RELEASE_SKILLS_PREFIX = 'skills/buildr-release/';
const ROOT_SOURCE_INPUTS = ['CHANGELOG.md'];

function normalizedProductPath(value: string): string | null {
  if (value === 'CHANGELOG.md') return value;
  if (value.startsWith(BUILDR_PREFIX)) return value.slice(BUILDR_PREFIX.length);
  if (value.startsWith(PRODUCT_PREFIX)) return value.slice(PRODUCT_PREFIX.length);
  if (value.startsWith(RELEASE_SKILLS_PREFIX)) return value;
  if (isVerificationGovernedRepositoryInput(value)) return value;
  return null;
}

/** Compare only source inputs that participate in verification ownership.
 * The repository can advance for unrelated release/bookkeeping commits. */
export function changedVerificationSourcePaths(repo: string, from: string, to: string): string[] | null {
  try {
    return execFileSync('git', ['-C', repo, 'diff', '--name-only', from, to, '--',
      BUILDR_PREFIX, PRODUCT_PREFIX, RELEASE_SKILLS_PREFIX, ...ROOT_SOURCE_INPUTS, ...VERIFICATION_GOVERNED_REPOSITORY_INPUTS,
    ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
      .split(/\r?\n/u).filter(Boolean);
  } catch { return null; }
}

export function createChangedVerificationSourcePathsReader(repo: string): (from: string, to: string) => string[] | null {
  const cache = new Map<string, string[] | null>();
  return (from, to) => {
    const key = `${from}..${to}`;
    if (!cache.has(key)) cache.set(key, changedVerificationSourcePaths(repo, from, to));
    return cache.get(key)!;
  };
}

export function verificationStepAffectedBy(step: any, changed: string[]): boolean | null {
  let ownership: any;
  try { ownership = Array.isArray(step.inputs) ? step : verificationStepOwnership(step.id, step.executor); }
  catch { return null; }
  return changed.some(value => {
    const productPath = normalizedProductPath(value);
    return productPath !== null && ownership.inputs.some((pattern: string) => matchesInput(productPath, pattern))
      && !(ownership.inputExclusions ?? []).some((pattern: string) => matchesInput(productPath, pattern));
  });
}

/** `undefined` means the record already belongs to the current source.
 * `null` means the source difference cannot be proven. */
export function sourceChangeAffected(step: any, record: any, head: string | null,
  readChangedPaths: (from: string, to: string) => string[] | null): boolean | null | undefined {
  const recordedSource = record?.origin?.sourceCommit;
  if (!head || !recordedSource || recordedSource === head) return undefined;
  const changed = readChangedPaths(recordedSource, head);
  if (changed === null) return null;
  return verificationStepAffectedBy(step, changed);
}

/** Content identities intentionally span a whole readable scope. When source
 * ownership proves the changed files are outside a check, keep the prior
 * content proof but still reject recipe, environment or Git input changes. */
export function verificationInputApplicabilityForSourceChange(
  previous: VerificationInputIdentity | null | undefined,
  current: VerificationInputIdentity | null | undefined,
  affected: boolean | null | undefined,
): { applicable: boolean; reasons: string[] } {
  if (affected !== false) return verificationInputApplicability(previous, current);
  if (!previous || !current) return { applicable: false, reasons: ['inputs-unavailable'] };
  const reasons: string[] = [];
  for (const [field, reason] of [
    ['stepId', 'check-changed'],
    ['recipeIdentity', 'check-recipe-changed'],
    ['environmentIdentity', 'environment-changed'],
    ['gitIdentity', 'git-input-changed'],
  ] as const) {
    if (previous[field] !== current[field]) reasons.push(reason);
  }
  return { applicable: reasons.length === 0, reasons };
}
