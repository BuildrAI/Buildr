import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseConnectionDefinition, safeConnectionRelativePath, type ConnectionBinding, type ConnectionDefinition, type ConnectionDiagnostic } from '../domain/definition.ts';
import { programRecipients, type ProgramRecipient } from '../infrastructure/program.ts';

export interface ConnectionSkillSource {
  id: string; assetIdentity: string; sourceIdentity: string; path?: string; enabled?: boolean; state?: string;
  connectionDefinitions?: string[];
}
export interface ConnectionSkillSourceFile { content: string; digest: string; directory: string; absolutePath: string }
export interface ConnectionCatalogAssets {
  readSkills(root: string): ConnectionSkillSource[];
  readSkillFile(root: string, skillPath: string, relative: string): ConnectionSkillSourceFile;
}
export interface ConnectionCatalogEntry {
  definition: ConnectionDefinition;
  skill: { id: string; assetIdentity: string; sourceIdentity: string; sourcePath: string; entryPath: string; directory: string };
  declarationPath: string; declarationRevision: string; programRecipients: Record<string, ProgramRecipient>; revision: string; enabled: boolean; available: boolean; diagnostics: ConnectionDiagnostic[];
}
export interface ConnectionCatalogResult { definitions: ConnectionCatalogEntry[]; diagnostics: ConnectionDiagnostic[] }
export interface ConnectionBindingResult { definition: ConnectionCatalogEntry | null; available: boolean; diagnostics: ConnectionDiagnostic[] }
const digest = (value: string) => `sha256-${createHash('sha256').update(value).digest('hex')}`;
const diagnostic = (code: string, message: string): ConnectionDiagnostic => ({ code, message });

export function createConnectionCatalog({ assets }: { assets: ConnectionCatalogAssets }) {
  function list(root: string): ConnectionCatalogResult {
    const definitions: ConnectionCatalogEntry[] = [], diagnostics: ConnectionDiagnostic[] = [];
    let sources: ConnectionSkillSource[];
    try { sources = assets.readSkills(root); } catch { return { definitions, diagnostics: [diagnostic('connection_skills_unavailable', '当前技能清单不可读取；未改变配置。')] }; }
    const seen = new Map<string, ConnectionCatalogEntry>();
    for (const skill of sources) {
      if (skill.connectionDefinitions === undefined) continue;
      if (!Array.isArray(skill.connectionDefinitions) || skill.connectionDefinitions.length > 32 || skill.connectionDefinitions.some(relative => typeof relative !== 'string')) { diagnostics.push(diagnostic('connection_definition_invalid', `技能 ${skill.id} 的连接声明引用不合法。`)); continue; }
      if (skill.connectionDefinitions.length === 0) continue;
      if (!skill.path) { diagnostics.push(diagnostic('connection_source_missing', `技能 ${skill.id} 没有完整本地源目录，不能加载连接声明。`)); continue; }
      if (skill.path !== `connections/${skill.id}`) { diagnostics.push(diagnostic('connection_skill_path_invalid', `连接技能 ${skill.id} 必须登记在 skills/connections/${skill.id}/；未加载声明，也未移动源文件。`)); continue; }
      try { assets.readSkillFile(root, skill.path, 'SKILL.md'); }
      catch { diagnostics.push(diagnostic('connection_skill_entry_invalid', `连接技能 ${skill.id} 的入口缺失、格式非法或名称与登记身份不一致；实例与认证保留。`)); continue; }
      const refs = new Set<string>();
      for (const relative of skill.connectionDefinitions) {
        try {
          safeConnectionRelativePath(relative);
          if (refs.has(relative)) throw new Error('duplicate reference'); refs.add(relative);
          const file = assets.readSkillFile(root, skill.path, relative);
          const definition = parseConnectionDefinition(file.content);
          const enabled = skill.enabled !== false && !['uninstalled', 'missing'].includes(skill.state || '');
          const source = { id: skill.id, assetIdentity: skill.assetIdentity, sourceIdentity: skill.sourceIdentity, sourcePath: skill.path, entryPath: path.join(file.directory, 'SKILL.md'), directory: file.directory };
          const recipients = programRecipients(root, { definition, skill: source });
          const declarationRevision = file.digest || digest(file.content);
          const entry: ConnectionCatalogEntry = {
            definition, skill: source,
            declarationPath: file.absolutePath,
            declarationRevision, programRecipients: recipients, revision: digest(JSON.stringify([declarationRevision, recipients])), enabled, available: enabled,
            diagnostics: enabled ? [] : [diagnostic('connection_skill_disabled', `技能 ${skill.id} 已停用或缺失。`)],
          };
          const identity = JSON.stringify([skill.assetIdentity, definition.definitionId]);
          const previous = seen.get(identity);
          if (previous) {
            const conflict = diagnostic('connection_definition_duplicate', `技能资产 ${skill.assetIdentity} 的定义 ${definition.definitionId} 重复，不能选择。`);
            previous.available = false; previous.diagnostics.push(conflict); entry.available = false; entry.diagnostics.push(conflict); diagnostics.push(conflict);
          } else seen.set(identity, entry);
          definitions.push(entry);
        } catch (cause) {
          const known = cause instanceof Error && 'code' in cause && String(cause.code).startsWith('connection_');
          diagnostics.push(known ? { code: String(cause.code), message: `技能 ${skill.id} 的声明 ${relative}：${cause.message}`, ...('field' in cause && typeof cause.field === 'string' ? { field: cause.field } : {}) } : diagnostic('connection_definition_invalid', `技能 ${skill.id} 的声明 ${relative} 缺失、不安全或格式非法。`));
        }
      }
    }
    return { definitions, diagnostics };
  }
  function resolve(root: string, binding: ConnectionBinding, observed?: ConnectionCatalogResult): ConnectionBindingResult {
    const catalog = observed || list(root);
    const matches = catalog.definitions.filter(entry => entry.skill.assetIdentity === binding.skillAssetIdentity && entry.definition.definitionId === binding.definitionId);
    if (!matches.length) return { definition: null, available: false, diagnostics: [diagnostic('connection_definition_missing', '已绑定定义当前不可用；实例与认证保留，不自动选择其他方法。'), ...catalog.diagnostics] };
    const entry = matches[0]!;
    const diagnostics = [...entry.diagnostics];
    if (matches.length > 1) diagnostics.push(diagnostic('connection_definition_duplicate', '已绑定定义身份有多个来源。'));
    if (entry.skill.sourceIdentity !== binding.sourceIdentity) diagnostics.push(diagnostic('connection_source_changed', '连接方法来源已变化；请核对实际来源后明确改绑。'));
    if (entry.definition.configVersion !== binding.configVersion) diagnostics.push(diagnostic('connection_config_incompatible', '连接配置版本不兼容；请审阅迁移差异，不自动改写。'));
    return { definition: entry, available: entry.available && diagnostics.length === 0, diagnostics };
  }
  return Object.freeze({ list, resolve });
}
