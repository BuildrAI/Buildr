import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { skillSourceRoot, readSkillText } from '../persistence/skill-content-repository.ts';

const fail = (code: string, message: string) => Object.assign(new Error(message), { code, status: 409 });
export function createSkillRegistration(d: {
  read(root: string): any[]; write(root: string, entries: any[]): string;
  owner(root: string, member: string): any; inspect(directory: string): any;
  mutate: (...args: any[]) => any; writeFile(file: string, content: string): void;
  remove(input: any): any; impacts(root: string, scope: string, id: string): any;
  assertName(name: string, label: string): void; assertWorkspace(root: string): void;
}) {
  const revision = (root: string) => {
    for (const relative of ['skills', 'skills/manifest.yml']) {
      try { if (fs.lstatSync(path.join(root, relative)).isSymbolicLink()) throw fail('skill_directory_invalid', '技能清单和根目录不能为符号链接。'); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    }
    const file = path.join(root, 'skills/manifest.yml');
    return `sha256-${crypto.createHash('sha256').update(fs.existsSync(file) ? fs.readFileSync(file) : '').digest('hex')}`;
  };
  const check = (root: string, expected: string) => { if (!expected || revision(root) !== expected) throw fail('skill_revision_conflict', '技能清单已变化，请重新读取。'); };
  function candidate(root: string, relative: string) {
    const directory = skillSourceRoot(root, relative), stat = fs.statSync(directory);
    const file = readSkillText(directory, 'SKILL.md');
    const source = d.inspect(directory);
    if (d.owner(root, `skills/${relative}`)) throw fail('skill_managed', '该技能由组件管理，请使用组件维护入口。');
    return { path: relative, id: source.metadata.name as string, description: String(source.metadata.description || ''), observation: `sha256-${crypto.createHash('sha256').update(JSON.stringify({ directory, dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, digest: file.digest })).digest('hex')}` };
  }
  function skillRegistrationCandidates(root: string) {
    d.assertWorkspace(root); revision(root);
    const entries = d.read(root), candidates: ReturnType<typeof candidate>[] = [], diagnostics: string[] = [];
    let count = 0;
    function walk(relative: string, depth: number) {
      if (depth > 6 || count > 500) return;
      const directory = relative ? skillSourceRoot(root, relative) : path.join(fs.realpathSync(root), 'skills');
      if (!fs.existsSync(directory)) return;
      if (fs.lstatSync(directory).isSymbolicLink()) throw fail('skill_directory_invalid', '技能根目录不能为符号链接。');
      if (relative && (entries.some(e => e.path === relative) || d.owner(root, `skills/${relative}`))) return;
      if (relative && fs.existsSync(path.join(directory, 'SKILL.md'))) {
        try { const item = candidate(root, relative); if (!entries.some(e => e.path === relative || e.id === item.id)) candidates.push(item); } catch (error: any) { diagnostics.push(`${relative}：${error.message}`); }
        return;
      }
      const handle = fs.opendirSync(directory);
      try { let entry; while ((entry = handle.readSync())) { if (++count > 500) { diagnostics.push('候选目录较多，本次已限制扫描数量。'); break; } if (entry.isDirectory() && !entry.name.startsWith('.')) walk(relative ? `${relative}/${entry.name}` : entry.name, depth + 1); } } finally { handle.closeSync(); }
    }
    walk('', 0);
    return { revision: revision(root), candidates, diagnostics };
  }
  function registerLocalSkill(root: string, input: any) {
    d.assertWorkspace(root); check(root, input.revision);
    const relative = input.path || input.id;
    if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some((p: string) => !p || p === '.' || p === '..')) throw fail('skill_directory_invalid', '请选择有效技能目录。');
    const destination = path.join(root, 'skills', relative);
    const execute = () => {
      check(root, input.revision);
      const entries = d.read(root);
      let entry;
      if (input.path) {
        const current = candidate(root, relative);
        if (!input.observation || current.observation !== input.observation) throw fail('skill_directory_changed', '技能目录或入口已变化，请重新选择。');
        entry = { id: current.id, path: current.path, description: current.description };
      } else {
        d.assertName(input.id, 'Skill id');
        if (d.owner(root, `skills/${relative}`)) throw fail('skill_managed', '该位置由组件管理。');
        // Resolve the skills root without following an untrusted directory link.
        if (fs.lstatSync(path.join(root, 'skills')).isSymbolicLink()) throw fail('skill_directory_invalid', '技能根目录不能为符号链接。');
        if (fs.existsSync(destination) || (() => { try { fs.lstatSync(destination); return true; } catch { return false; } })()) throw fail('skill_directory_occupied', '目录已存在，请选择已有技能目录。');
        if (!input.description?.trim() || !input.content?.trim()) throw fail('skill_content_required', '请填写技能描述和正文。');
        entry = { id: input.id, path: input.id, description: input.description.trim() };
      }
      if (entries.some(e => e.id === entry.id || e.path === entry.path)) throw fail('skill_already_registered', '技能或目录已经登记。');
      if (!input.path) d.writeFile(path.join(destination, 'SKILL.md'), `---\n${YAML.stringify({ name: entry.id, description: entry.description })}---\n\n${input.content.trim()}\n`);
      entries.push(entry); d.write(root, entries);
      return { id: entry.id, revision: revision(root) };
    };
    return d.mutate(root, 'skills.register', [path.join(root, 'skills/manifest.yml'), ...(!input.path ? [destination] : [])], execute);
  }
  function skillRemoval(root: string, id: string) {
    revision(root);
    const entry = d.read(root).find(e => e.id === id);
    if (!entry) throw fail('skill_not_found', '技能已不存在，请重新读取。');
    const owner = entry.path ? d.owner(root, `skills/${entry.path}`) : null;
    const reason = owner ? `由组件 ${owner} 管理，请使用组件维护入口。` : '';
    return { revision: revision(root), removable: !reason, reason, impacts: d.impacts(root, '.', id).impacts || [] };
  }
  function removeRegisteredSkill(root: string, id: string, input: any) {
    return d.mutate(root, 'skills.unregister', [path.join(root, 'skills/manifest.yml')], () => {
      check(root, input.revision); const current = skillRemoval(root, id);
      if (!current.removable) throw fail('skill_managed', current.reason);
      const result = d.remove({ targetRoot: root, id });
      return { id, revision: revision(root), impacts: result.impacts };
    });
  }
  return { skillRegistrationCandidates, registerLocalSkill, skillRemoval, removeRegisteredSkill };
}
