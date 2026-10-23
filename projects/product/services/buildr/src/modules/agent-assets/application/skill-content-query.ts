import { openDirectory } from '../../../infrastructure/filesystem/open-directory.ts';
import path from 'node:path';
import { resolveSharedResource } from '../../../infrastructure/product-resources/shared-resources.ts';
import { listSkillFiles, readSkillText, skillContentError, skillHeading, skillReadingBody, skillReadMessage, skillSourceRoot } from '../persistence/skill-content-repository.ts';

type Dependencies = { readSkillsManifestForWrite(root: string): any[] };
export function createSkillContentQuery(dependencies: Dependencies, open = openDirectory) {
  function sourceRoot(root: string, skill: any) { return skill.resource ? path.dirname(resolveSharedResource(root, `${skill.resource}/SKILL.md`)) : skillSourceRoot(root, skill.path); }
  function entries(root: string) { return dependencies.readSkillsManifestForWrite(root); }
  function entry(root: string, id: string) {
    const skill = entries(root).find((item) => item.id === id);
    if (!skill) throw skillContentError('当前工作空间未登记这个技能。', 404);
    return skill;
  }
  function sourceLabel(skill: any): string {
    if (skill.source === 'openspec') return skill.resource?'OpenSpec 提供 · 共享':'OpenSpec 提供';
    if (skill.source === 'buildr') return skill.resource?'Buildr 提供 · 共享':'Buildr 提供';
    if (typeof skill.source === 'string' && skill.path) return `${skill.source} 提供`;
    if (skill.source || skill.resolved) return '远端来源';
    return '工作空间维护';
  }
  function summary(root: string, skill: any) {
    let title = skill.id;
    let contentIssue: string | null = null;
    let sourcePath=typeof skill.path==='string'?`skills/${skill.path}`:null;
    if (typeof skill.path === 'string') {
      try { const directory=sourceRoot(root,skill);sourcePath=directory;title = skillHeading(readSkillText(directory, 'SKILL.md').content) || title; }
      catch (error) { contentIssue = skillReadMessage(error); }
    } else contentIssue = '此技能没有已登记的本地源目录，可请智能体核对安装来源。';
    return { id: skill.id, title, description: skill.description || '', sourceLabel: sourceLabel(skill), sourcePath, sourceReference: skill.resource ? `buildr-resource:${skill.resource}` : typeof skill.source === 'object' ? skill.source?.url || null : skill.resolved?.url || null, enabled: skill.enabled !== false, required: skill.required === true, contentIssue };
  }
  return {
    async openSkillSource(root: string, id: string) {
      const skill = entry(root, id);
      if (!skill.path) throw skillContentError('此技能没有可打开的本机源目录。', 404);
      return open(sourceRoot(root, skill));
    },
    listSkills(root: string) { return { skills: entries(root).map((skill) => summary(root, skill)) }; },
    skillDetail(root: string, id: string) {
      const skill = entry(root, id);
      const result = summary(root, skill);
      try {
        if (!skill.path) return { skill: result, files: [], truncated: false, issue: result.contentIssue };
        return { skill: result, ...listSkillFiles(sourceRoot(root, skill)), issue: null };
      } catch (error) { return { skill: result, files: [], truncated: false, issue: skillReadMessage(error) }; }
    },
    skillFile(root: string, id: string, file: string) {
      const skill = entry(root, id);
      if (!skill.path) throw skillContentError('此技能没有已登记的本地源目录。', 404);
      try {
        const result = readSkillText(sourceRoot(root, skill), file);
        return { ...result, readingContent: result.format === 'markdown' ? skillReadingBody(result.content) : result.content };
      } catch (error) { throw skillContentError(skillReadMessage(error), (error as { status?: number }).status || 400); }
    },
  };
}
