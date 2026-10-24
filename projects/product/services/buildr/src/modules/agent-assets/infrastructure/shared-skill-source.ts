import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { resolveSharedResource } from '../../../infrastructure/product-resources/shared-resources.ts';
/** Resolve only an explicitly registered official reference; never infer ownership by name. */
export function sharedSkillSource(root: string, member: string): string {
  if (!member || member.includes('\\') || member.includes('\0') || path.posix.normalize(member)!==member || member.startsWith('/') || member.split('/').includes('..')) throw new Error('Skill source path must stay inside workspace.');
  const local = path.join(root, member);
  let current=root;
  for(const part of member.split('/')){current=path.join(current,part);if(fs.lstatSync(current,{throwIfNoEntry:false})?.isSymbolicLink())throw new Error('Skill source path crosses a symbolic link.');}
  if (!member.startsWith('skills/') || fs.existsSync(local)) return fs.existsSync(local) ? fs.realpathSync(local) : local;
  const manifest = path.join(root, 'skills/manifest.yml');
  if (!fs.existsSync(manifest)) return local;
  if(fs.lstatSync(manifest).isSymbolicLink())throw new Error('Skill manifest must not be a symbolic link.');
  const document = YAML.parse(fs.readFileSync(manifest, 'utf8'));
  const entry = document?.skills?.find((skill: any) => skill.resource && `skills/${skill.path}` === member);
  // Shared resource roots may sit behind /var→/private/var style aliases; kernel path
  // checks compare canonical spellings, so resolve the real path like skillSourceRoot does.
  return entry ? fs.realpathSync(path.dirname(resolveSharedResource(root, `${entry.resource}/SKILL.md`))) : local;
}
