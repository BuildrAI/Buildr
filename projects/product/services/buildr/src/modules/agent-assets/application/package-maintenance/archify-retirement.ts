import fs from 'node:fs';
import path from 'node:path';
import { readPreservedArchify, resolveSharedResource } from '../../../../infrastructure/product-resources/shared-resources.ts';
import { enumerateSkillSourceFiles } from '../../infrastructure/runtime/skills/projection-files.ts';

const resource = 'resources/workspace/skills/buildr/archify';
const localPath = 'skills/buildr/archify';

/** Retire the historical package owner without retiring a user's installed tool. */
export function retirePackagedArchify({ targetRoot, checkOnly, readSkills, writeSkills, readComponents, writeComponents, assertSafe, readDefinition }: any): any {
  const skills = readSkills(targetRoot), components = readComponents(targetRoot);
  const entry = skills.find((skill: any) => skill.id === 'archify');
  const component = components.components.find((item: any) => item.id === 'archify' && item.source === 'buildr' && item.path === 'components/buildr/archify');
  const official = entry?.source === 'buildr' && entry.path === 'buildr/archify' && (!entry.resource || entry.resource === resource);
  if (!official && !component) return { changed: [], findings: [] };
  const target = path.join(targetRoot, localPath), stage = `${target}.buildr-stage`;
  for (const file of [target, stage, path.join(targetRoot, 'components/manifest.yml'), path.join(targetRoot, 'components/buildr/archify')]) assertSafe(targetRoot, file, targetRoot, 'Archify migration');
  if (component) {
    const definition = path.join(targetRoot, component.path, 'component.yml');
    if (fs.existsSync(definition)) {
      const declared = readDefinition(definition, 'archify');
      if (declared.source !== 'buildr' || (declared.members.rules?.length ?? 0) || declared.members.commandCollections.length || declared.members.skillContributions.length || declared.members.skills.length !== 1 || declared.members.skills[0] !== localPath) throw new Error('旧 Archify 组件含有不同归属或额外成员，已保留现场。');
    }
  }
  // A locally maintained source always wins. Never replace user bytes with a snapshot.
  const local = fs.lstatSync(target, { throwIfNoEntry: false });
  if (local && !local.isDirectory()) throw new Error('Archify 本地来源不是普通目录，未迁移。');
  let source: string | null = null;
  if (official && !local) {
    try { source = readPreservedArchify().sourceRoot; }
    catch (error) {
      if (!checkOnly) throw error;
      source = path.dirname(resolveSharedResource(targetRoot, `${resource}/SKILL.md`));
    }
    // The preservation descriptor is not a Skill attachment.
    if (!fs.statSync(path.join(source!, 'SKILL.md')).isFile()) throw new Error('Archify 历史来源缺少技能入口。');
  } else if (official && local) enumerateSkillSourceFiles(target);
  const finding = { type: 'skill', id: 'archify', status: 'installed', path: localPath, converge: true, reason: 'Archify 已退出产品内置，将保留为此工作空间自有技能。' };
  if (checkOnly) return { changed: [], findings: [finding] };
  const changed: string[] = [];
  if (source) {
    const preserved = readPreservedArchify();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(stage);
    try {
      for (const entry of preserved.set.files) {
        const destination = path.join(stage, entry.path.slice('files/'.length));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(preserved.root, entry.path), destination, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(destination, entry.mode);
      }
      const entryFile = path.join(stage, 'SKILL.md');
      const original = fs.readFileSync(entryFile, 'utf8');
      const frontmatter = original.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0];
      if (!frontmatter) throw new Error('Archify 历史入口格式无效，未替换工作空间来源。');
      fs.writeFileSync(entryFile, `${frontmatter}\n# Archify\n\n绘图前读取随附的 [Archify 上游说明](assets/archify/SKILL.md)，上游相对路径从 assets/archify/ 解析。图示输入和输出使用目标项目的绝对路径。\n\n本技能已退出 Buildr 内置，由当前工作空间自行维护完整来源和版本。不使用旧的内置组件安装、更新或卸载指令；保留项目图示，不自动升级上游。\n`);
      enumerateSkillSourceFiles(stage);
      fs.renameSync(stage, target);
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
    changed.push(localPath);
  }
  if (component) {
    // Release the retired owner before validating a customized local Skill.
    // Both registry writes participate in the caller's workspace transaction.
    components.components.splice(components.components.indexOf(component), 1);
    writeComponents(targetRoot, components); changed.push('components/manifest.yml');
  }
  if (official) {
    const next = { ...entry, source: 'workspace', sourceIdentity: 'workspace:skills/buildr/archify', customizedFrom: 'archify', customizedSourceIdentity: entry.sourceIdentity };
    delete next.resource; delete next.component;
    skills[skills.indexOf(entry)] = next;
    writeSkills(targetRoot, skills); changed.push('skills/manifest.yml');
  }
  // Keep historical definitions as ordinary files; they may carry user edits.
  return { changed, findings: [] };
}
