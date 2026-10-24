import { parseSemver } from '../../../infrastructure/semantic-version.ts';
export { parseSemver, compareVersions } from '../../../infrastructure/semantic-version.ts';

export function defaultReleaseTrack(version: any) {
  return parseSemver(version)?.prerelease.length ? 'candidate' : 'stable';
}
