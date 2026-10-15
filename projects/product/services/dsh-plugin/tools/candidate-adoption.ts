/** Keep the tested Candidate identity separate from its protected main inclusion. */
import { isDeepStrictEqual } from 'node:util';
import { containsCredentialMaterial } from '../../buildr/tools/release/release-authority.ts';
import { parseReleaseCandidate, type ReleaseCandidate } from './release-candidate.ts';

export const PLUGIN_CANDIDATE_ADOPTION_SCHEMA = 'buildr.dsh-plugin-candidate-adoption/v1';
export const PLUGIN_CANDIDATE_ADOPTION_FILE = 'plugin-candidate-adoption.json';
export interface PluginCandidateMain { commit: string; tree: string; parents: string[]; serviceTree: string }
export interface PluginCandidateSource {
  runId: number; runAttempt: number; commit: string; tree: string; serviceTree: string;
  selectionIdentity: string; workflowSha256: string;
}
export interface PluginCandidateAdoption {
  schemaVersion: typeof PLUGIN_CANDIDATE_ADOPTION_SCHEMA; status: 'passed'; repository: 'BuildrAI/Buildr';
  source: PluginCandidateSource; main: PluginCandidateMain; candidate: ReleaseCandidate;
}
const sha = /^[a-f0-9]{40}$/u;
const digest = /^(?:sha256-)?[a-f0-9]{64}$/u;
export function assertPluginCandidateAdoption(value: unknown, manifestValue: ReleaseCandidate, main: PluginCandidateMain): PluginCandidateAdoption {
  const valueObject = value as PluginCandidateAdoption;
  const manifest = parseReleaseCandidate(manifestValue);
  if (!valueObject || containsCredentialMaterial(valueObject) || valueObject.schemaVersion !== PLUGIN_CANDIDATE_ADOPTION_SCHEMA
    || valueObject.status !== 'passed' || valueObject.repository !== 'BuildrAI/Buildr'
    || !isDeepStrictEqual(valueObject.candidate, manifest) || !isDeepStrictEqual(valueObject.main, main)) throw new Error('Plugin Candidate adoption identity differs.');
  const source = valueObject.source;
  if (!source || !Number.isSafeInteger(source.runId) || source.runId < 1 || !Number.isSafeInteger(source.runAttempt)
    || source.runAttempt < 1 || source.runAttempt > 100 || !digest.test(source.selectionIdentity ?? '') || !/^[a-f0-9]{64}$/u.test(source.workflowSha256 ?? '')
    || ![source.commit, source.tree, source.serviceTree, main.commit, main.tree, main.serviceTree].every(item => sha.test(item ?? ''))
    || source.commit !== manifest.sourceCommit || source.serviceTree !== manifest.sourceTree || main.serviceTree !== source.serviceTree
    || main.tree !== source.tree || !Array.isArray(main.parents) || main.parents.length !== 2
    || !main.parents.every(item => sha.test(item)) || main.parents[1] !== source.commit) throw new Error('Plugin Candidate protected main inclusion differs.');
  return valueObject;
}
export function createPluginCandidateAdoption(input: { source: PluginCandidateSource; main: PluginCandidateMain; candidate: ReleaseCandidate }): PluginCandidateAdoption {
  const value: PluginCandidateAdoption = { schemaVersion: PLUGIN_CANDIDATE_ADOPTION_SCHEMA, status: 'passed', repository: 'BuildrAI/Buildr', ...input };
  return assertPluginCandidateAdoption(value, input.candidate, input.main);
}
