import type { ResourceSet } from './shared-resources.ts';
import { preservedSkillRoot, preserveSkillSourceBeforeReplacement } from './preserved-skills.ts';

export const LEGACY_ARCHIFY_SOURCE = 'workspace/skills/buildr/archify/';
export const preservedArchifyRoot = (sharedRoot: string) => preservedSkillRoot(sharedRoot, 'archify');

/** A migration source for existing installations, never part of the new package. */
export function preserveArchifyBeforeReplacement(sharedRoot: string, old: ResourceSet, inspect: (root: string) => ResourceSet, assertPlain: (file: string) => void): void {
  preserveSkillSourceBeforeReplacement(sharedRoot, old, LEGACY_ARCHIFY_SOURCE, 'Archify', inspect, assertPlain);
}
