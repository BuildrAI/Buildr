import fs from 'node:fs';
import path from 'node:path';
import { resolveSharedResource } from '../../../infrastructure/product-resources/shared-resources.ts';
import { sharedSkillSource } from './shared-skill-source.ts';

import { validateComponentMemberResources } from '../domain/component-member-resources.ts';

export function componentMemberSource(root: string, member: string, definition: any): string {
  const errors = validateComponentMemberResources(definition);
  if (errors.length) throw new Error(errors.join('\n'));
  const source = definition.memberResources?.[member];
  if (!source) return sharedSkillSource(root, member);
  // Validate all local path segments, including dangling links, before observing
  // an unexpected copy. Never hide user bytes behind an official reference.
  let current = root;
  for (const segment of member.split('/')) {
    current = path.join(current, segment);
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`Component member path crosses a symbolic link: ${current}`);
  }
  if (fs.existsSync(path.join(root, member))) throw new Error(`Shared Component member conflicts with a local copy: ${member}`);
  return fs.realpathSync(resolveSharedResource(root, source));
}
