import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseConnectionDefinition, safeConnectionRelativePath, type ConnectionBinding, type ConnectionDefinition, type ConnectionDiagnostic } from '../domain/definition.ts';
import { programRecipients, type ProgramRecipient } from '../infrastructure/program.ts';

export interface ConnectionSkillSource {
  id: string; assetIdentity: string; sourceIdentity: string; path?: string; enabled?: boolean; state?: string;
  connectionDefinitions?: string[];
}
export interface ConnectionSkillSourceFile { content: string; digest: string; directory: string; absolutePath: string }
export type ConnectionSkillSourceRead = { ok: true; file: ConnectionSkillSourceFile } | { ok: false; error: Error };
type SourceRequest = { skillPath: string; relative: string };
export interface ConnectionCatalogAssets {
  readSkills(root: string): ConnectionSkillSource[];
  readSkillFile(root: string, skillPath: string, relative: string): ConnectionSkillSourceFile;
  readSkillFiles?(root: string, requests: readonly SourceRequest[]): ConnectionSkillSourceRead[];
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
// The public source port bounds every strict read batch to at most 16 files.
const SOURCE_BATCH_SIZE = 16;

export function createConnectionCatalog({ assets }: { assets: ConnectionCatalogAssets }) {
  function readFiles(root: string, requests: readonly SourceRequest[]): ConnectionSkillSourceRead[] {
    if (assets.readSkillFiles) {
      try { return assets.readSkillFiles(root, requests); }
      catch (cause) { return requests.map(() => ({ ok: false, error: cause instanceof Error ? cause : new Error('Source unavailable') })); }
    }
    return requests.map(request => {
      try { return { ok: true, file: assets.readSkillFile(root, request.skillPath, request.relative) }; }
      catch (cause) { return { ok: false, error: cause instanceof Error ? cause : new Error('Source unavailable') }; }
    });
  }
  function list(root: string): ConnectionCatalogResult {
    const definitions: ConnectionCatalogEntry[] = [], diagnostics: ConnectionDiagnostic[] = [];
    let sources: ConnectionSkillSource[];
    try { sources = assets.readSkills(root); } catch { return { definitions, diagnostics: [diagnostic('connection_skills_unavailable', '当前技能清单不可读取；未改变配置。')] }; }
    type Reference = { relative: string; entry?: ConnectionCatalogEntry; diagnostic?: ConnectionDiagnostic };
    type Source = { skill: ConnectionSkillSource; diagnostic?: ConnectionDiagnostic; validEntry?: boolean; references: Reference[] };
    const candidates: Source[] = [];
    for (const skill of sources) {
      if (skill.connectionDefinitions === undefined) continue;
      if (!Array.isArray(skill.connectionDefinitions) || skill.connectionDefinitions.length > 32 || skill.connectionDefinitions.some(relative => typeof relative !== 'string')) { candidates.push({ skill, references: [], diagnostic: diagnostic('connection_definition_invalid', `技能 ${skill.id} 的连接声明引用不合法。`) }); continue; }
      if (skill.connectionDefinitions.length === 0) continue;
      const source: Source = { skill, references: [] }; candidates.push(source);
      if (!skill.path) source.diagnostic = diagnostic('connection_source_missing', `技能 ${skill.id} 没有完整本地源目录，不能加载连接声明。`);
      else if (skill.path !== `connections/${skill.id}`) source.diagnostic = diagnostic('connection_skill_path_invalid', `连接技能 ${skill.id} 必须登记在 skills/connections/${skill.id}/；未加载声明，也未移动源文件。`);
    }
    const entries = candidates.filter(source => !source.diagnostic);
    for (let offset = 0; offset < entries.length; offset += SOURCE_BATCH_SIZE) {
      const batch = entries.slice(offset, offset + SOURCE_BATCH_SIZE);
      const results = readFiles(root, batch.map(({ skill }) => ({ skillPath: skill.path!, relative: 'SKILL.md' })));
      batch.forEach((source, index) => {
        if (results[index]?.ok) source.validEntry = true;
        else source.diagnostic = diagnostic('connection_skill_entry_invalid', `连接技能 ${source.skill.id} 的入口缺失、格式非法或名称与登记身份不一致；实例与认证保留。`);
      });
    }
    const pending: Array<{ source: Source; reference: Reference }> = [];
    const definitionDiagnostic = (skill: ConnectionSkillSource, relative: string, cause: unknown): ConnectionDiagnostic => {
      const known = cause instanceof Error && 'code' in cause && String(cause.code).startsWith('connection_');
      return known ? { code: String(cause.code), message: `技能 ${skill.id} 的声明 ${relative}：${cause.message}`, ...('field' in cause && typeof cause.field === 'string' ? { field: cause.field } : {}) } : diagnostic('connection_definition_invalid', `技能 ${skill.id} 的声明 ${relative} 缺失、不安全或格式非法。`);
    };
    // A rejected entry never schedules any of its declaration attachments.
    for (const source of candidates) {
      if (!source.validEntry) continue;
      const refs = new Set<string>();
      for (const relative of source.skill.connectionDefinitions!) {
        const reference: Reference = { relative }; source.references.push(reference);
        try {
          safeConnectionRelativePath(relative);
          if (refs.has(relative)) throw new Error('duplicate reference'); refs.add(relative);
          pending.push({ source, reference });
        } catch (cause) { reference.diagnostic = definitionDiagnostic(source.skill, relative, cause); }
      }
    }
    for (let offset = 0; offset < pending.length; offset += SOURCE_BATCH_SIZE) {
      const batch = pending.slice(offset, offset + SOURCE_BATCH_SIZE);
      const results = readFiles(root, batch.map(({ source, reference }) => ({ skillPath: source.skill.path!, relative: reference.relative })));
      batch.forEach(({ source: candidate, reference }, index) => {
        const skill = candidate.skill;
        try {
          const result = results[index]; if (!result || !result.ok) throw result?.error || new Error('Source unavailable');
          const file = result.file;
          const definition = parseConnectionDefinition(file.content);
          const enabled = skill.enabled !== false && !['uninstalled', 'missing'].includes(skill.state || '');
          const source = { id: skill.id, assetIdentity: skill.assetIdentity, sourceIdentity: skill.sourceIdentity, sourcePath: skill.path!, entryPath: path.join(file.directory, 'SKILL.md'), directory: file.directory };
          const recipients = programRecipients(root, { definition, skill: source });
          const declarationRevision = file.digest || digest(file.content);
          reference.entry = {
            definition, skill: source,
            declarationPath: file.absolutePath,
            declarationRevision, programRecipients: recipients, revision: digest(JSON.stringify([declarationRevision, recipients])), enabled, available: enabled,
            diagnostics: enabled ? [] : [diagnostic('connection_skill_disabled', `技能 ${skill.id} 已停用或缺失。`)],
          };
        } catch (cause) { reference.diagnostic = definitionDiagnostic(skill, reference.relative, cause); }
      });
    }
    const seen = new Map<string, ConnectionCatalogEntry>();
    for (const source of candidates) {
      if (source.diagnostic) diagnostics.push(source.diagnostic);
      for (const reference of source.references) {
        if (reference.diagnostic) diagnostics.push(reference.diagnostic);
        if (reference.entry) {
          const entry = reference.entry;
          const identity = JSON.stringify([source.skill.assetIdentity, entry.definition.definitionId]);
          const previous = seen.get(identity);
          if (previous) {
            const conflict = diagnostic('connection_definition_duplicate', `技能资产 ${source.skill.assetIdentity} 的定义 ${entry.definition.definitionId} 重复，不能选择。`);
            previous.available = false; previous.diagnostics.push(conflict); entry.available = false; entry.diagnostics.push(conflict); diagnostics.push(conflict);
          } else seen.set(identity, entry);
          definitions.push(entry);
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
