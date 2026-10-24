import { sharedSkillSource } from '../infrastructure/shared-skill-source.ts';
import path from 'node:path';
import { readSkillText, readSkillTexts, skillContentError } from '../persistence/skill-content-repository.ts';
import { VERIFIED_READONLY_BATCH_SIZE } from '../../../infrastructure/filesystem/verified-readonly-file.ts';
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
  const directory = sharedSkillSource(root, `skills/${skillPath}`);
  const file = readSkillText(directory, relative, { requireRootProof: true });
  if (relative === 'SKILL.md' && parseSkillFrontmatterNameFromContent(file.content, path.join(directory, 'SKILL.md')) !== path.posix.basename(skillPath)) throw skillContentError('技能源入口名称与登记身份不一致。');
  return { ...file, directory, absolutePath: path.join(directory, ...relative.split('/')) };
}

/** Same source policy as the single-file port, with independent results in request order. */
export function readConnectionSkillFiles(root: string, requests: readonly { skillPath: string; relative: string }[]) {
  if (requests.length > VERIFIED_READONLY_BATCH_SIZE) throw skillContentError('技能文件读取批次超过限制。');
  type Result = { ok: true; file: ReturnType<typeof readConnectionSkillFile> } | { ok: false; error: Error };
  const results: Result[] = new Array(requests.length);
  const readable: Array<{ index: number; skillPath: string; directory: string; relative: string }> = [];
  requests.forEach((request, index) => {
    try { readable.push({ index, ...request, directory: sharedSkillSource(root, `skills/${request.skillPath}`) }); }
    catch (cause) { results[index] = { ok: false, error: cause instanceof Error ? cause : skillContentError('技能来源不可读取。') }; }
  });
  const observed = readSkillTexts(readable);
  readable.forEach((request, index) => {
    const result = observed[index]!;
    if (!result.ok) { results[request.index] = result; return; }
    try {
      if (request.relative === 'SKILL.md' && parseSkillFrontmatterNameFromContent(result.file.content, path.join(request.directory, 'SKILL.md')) !== path.posix.basename(request.skillPath)) throw skillContentError('技能源入口名称与登记身份不一致。');
      results[request.index] = { ok: true, file: { ...result.file, directory: request.directory, absolutePath: path.join(request.directory, ...request.relative.split('/')) } };
    } catch (cause) { results[request.index] = { ok: false, error: cause instanceof Error ? cause : skillContentError('技能源入口不可读取。') }; }
  });
  return results;
}
