import path from 'node:path';
import { readSkillText, skillContentError, skillSourceRoot } from '../persistence/skill-content-repository.ts';
import { parseSkillFrontmatterNameFromContent } from '../infrastructure/runtime/skills/primitives.ts';
import { parseSkillsManifestContent } from '../persistence/skill-manifest.ts';
import { sourceRelativePath } from '../persistence/source-object-repository.ts';

/** Extension defects are diagnosed per Skill by their consumer; canonical registry mutations remain strict. */
export function readConnectionSkillSources(root: string) {
  sourceRelativePath(root, 'skills/manifest.yml');
  return parseSkillsManifestContent(readSkillText(root, 'skills/manifest.yml', { requireRootProof: true }).content, path.join(root, 'skills/manifest.yml'), { validateContracts: false, validateConnectionDefinitions: false }).skills || [];
}

/** Public, bounded source-file reader; no runtime projection or program execution. */
export function readConnectionSkillFile(root: string, skillPath: string, relative: string) {
  const directory = skillSourceRoot(root, skillPath);
  const file = readSkillText(directory, relative, { requireRootProof: true });
  if (relative === 'SKILL.md' && parseSkillFrontmatterNameFromContent(file.content, path.join(directory, 'SKILL.md')) !== path.posix.basename(skillPath)) throw skillContentError('技能源入口名称与登记身份不一致。');
  return { ...file, directory, absolutePath: path.join(directory, ...relative.split('/')) };
}
