import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AgentServiceError } from '../domain/agent-state.ts';
import type { ExecutionScope, ExecutionScopeRef } from '../execution-contracts.ts';
import { defaultHarnessWorkspaceRoot } from '../profile.ts';

export const BUILDR_SOURCE_ID = 'buildr';
const WORKSPACE_REGISTRY_SCHEMA = 'buildr.local-workspace-registry/v1';
const WORKSPACE_SCHEMA_V1 = 'buildr.workspace/v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LocalRegisteredWorkspace extends ExecutionScope {
  name: string;
  selectedPath: string;
}

interface ParsedRegistryEntry {
  selectedPath: string;
  id: string | null;
  conflictIds: string[];
  name?: string;
  status: 'ready' | 'identity_conflict' | 'unavailable' | 'invalid';
  observed?: LocalRegisteredWorkspace;
}

function samePath(left: string, right: string): boolean {
  const canonical = (value: string) => {
    try { return fs.realpathSync(path.resolve(value)); }
    catch { return path.resolve(value); }
  };
  return canonical(left) === canonical(right);
}

function stripPlainComment(value: string): string {
  const match = value.match(/^(.*?)\s+#.*$/);
  return (match ? match[1]! : value).trim();
}

function parseSingleQuotedScalar(raw: string): string | undefined {
  let content = '';
  for (let i = 1; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '\'') {
      if (raw[i + 1] === '\'') { content += '\''; i++; continue; }
      const rest = raw.slice(i + 1).trim();
      return !rest || rest.startsWith('#') ? content : undefined;
    }
    content += ch;
  }
  return undefined;
}

function parseDoubleQuotedScalar(raw: string): string | undefined {
  let content = '';
  for (let i = 1; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '"') {
      const rest = raw.slice(i + 1).trim();
      return !rest || rest.startsWith('#') ? content : undefined;
    }
    if (ch !== '\\') { content += ch; continue; }
    const esc = raw[++i];
    if (esc === undefined) return undefined;
    if (esc === '"' || esc === '\\' || esc === '/') content += esc;
    else if (esc === 'n') content += '\n';
    else if (esc === 'r') content += '\r';
    else if (esc === 't') content += '\t';
    else if (esc === 'b') content += '\b';
    else if (esc === 'f') content += '\f';
    else if (esc === '0') content += '\0';
    else if (esc === 'x' && /^[0-9a-f]{2}/i.test(raw.slice(i + 1, i + 3))) {
      content += String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (esc === 'u' && raw[i + 1] === '{') {
      const end = raw.indexOf('}', i + 2);
      if (end < 0) return undefined;
      const code = parseInt(raw.slice(i + 2, end), 16);
      if (!Number.isFinite(code)) return undefined;
      content += String.fromCodePoint(code);
      i = end;
    } else if (esc === 'u' && /^[0-9a-f]{4}/i.test(raw.slice(i + 1, i + 5))) {
      content += String.fromCharCode(parseInt(raw.slice(i + 1, i + 5), 16));
      i += 4;
    } else {
      content += esc;
    }
  }
  return undefined;
}

/** Reads top-level scalar values from Buildr YAML metadata without external dependencies. */
export function readYamlTopLevelScalars(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || /^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:(?:\s*(.*))?$/);
    if (!match) continue;
    const key = match[1]!;
    const rest = (match[2] ?? '').trim();
    if (!rest || rest.startsWith('#') || /^[|>][+-0-9]*(?:\s+#.*)?$/.test(rest)) continue;
    if (rest.startsWith('\'')) {
      const parsed = parseSingleQuotedScalar(rest);
      if (parsed !== undefined) result[key] = parsed;
      continue;
    }
    if (rest.startsWith('"')) {
      const parsed = parseDoubleQuotedScalar(rest);
      if (parsed !== undefined) result[key] = parsed;
      continue;
    }
    if (/^[\[{]/.test(rest)) continue;
    const plain = stripPlainComment(rest);
    if (plain && !['null', '~'].includes(plain)) result[key] = plain;
  }
  return result;
}

function readRegistryRoots(file: string): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { schemaVersion?: unknown; roots?: unknown };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.schemaVersion !== WORKSPACE_REGISTRY_SCHEMA || !Array.isArray(parsed.roots)) return [];
    const seen = new Set<string>();
    const roots: string[] = [];
    for (const root of parsed.roots) {
      if (typeof root !== 'string' || !path.isAbsolute(root)) continue;
      const resolved = path.resolve(root);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      roots.push(resolved);
    }
    return roots;
  } catch {
    return [];
  }
}

function previewSharedRegistryFile(dataRoot: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.BUILDR_LOCAL_APP_PREVIEW;
  if (!raw) return null;
  let instance: string | null = null;
  try {
    const owner = JSON.parse(raw) as { workspaceMode?: unknown; instance?: unknown };
    if (owner?.workspaceMode === 'snapshot') return null;
    if (typeof owner?.instance === 'string' && owner.instance) instance = owner.instance;
  } catch {
    return null;
  }
  if (!instance) return null;
  const resolved = path.resolve(dataRoot);
  const previewsRoot = path.dirname(resolved);
  const sharedRoot = path.dirname(previewsRoot);
  if (resolved !== path.join(previewsRoot, instance) || path.basename(previewsRoot) !== 'previews') return null;
  return path.join(sharedRoot, 'workspace-registry.json');
}

export function resolveLocalDefaultWorkspaceRoot(dataRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  const dataRootDefault = path.resolve(dataRoot, 'default-workspace');
  if (!env.BUILDR_APP_DATA_DIR && fs.existsSync(dataRootDefault)) return dataRootDefault;
  return defaultHarnessWorkspaceRoot(dataRoot, { env });
}

function scopeRevision(ref: ExecutionScopeRef, rootPath: string, info: fs.Stats): string {
  // Keep exact parity with Development's scope revision calculation so online
  // and offline host resolution never invalidate an active conversation.
  return createHash('sha256').update(JSON.stringify([ref, rootPath, info.ino, info.birthtimeMs])).digest('hex');
}

function observeDirectory(root: string): { rootPath: string; info: fs.Stats } {
  const rootPath = fs.realpathSync(root);
  const info = fs.statSync(rootPath);
  if (!info.isDirectory()) throw new Error('not a directory');
  fs.accessSync(rootPath, fs.constants.R_OK | fs.constants.X_OK);
  return { rootPath, info };
}

/** Built-in read-only authority for local workspaces registered in the same data domain. */
export class LocalWorkspaceAuthority {
  private readonly dataRoot: string;
  constructor(dataRoot: string) {
    this.dataRoot = path.resolve(dataRoot);
  }

  private registryRoots(): string[] {
    const localRoots = readRegistryRoots(path.join(this.dataRoot, 'workspace-registry.json'));
    const sharedFile = previewSharedRegistryFile(this.dataRoot);
    if (!sharedFile) return localRoots;
    const sharedRoots = readRegistryRoots(sharedFile).filter(root => !localRoots.some(local => samePath(local, root)));
    return [...sharedRoots, ...localRoots];
  }

  private readEntries(): ParsedRegistryEntry[] {
    const entries: ParsedRegistryEntry[] = this.registryRoots().map(root => {
      try {
        const workspaceFile = path.join(root, '.buildr', 'workspace.yml');
        if (!fs.existsSync(workspaceFile)) {
          return { selectedPath: root, id: null, conflictIds: [], status: fs.existsSync(root) ? 'invalid' : 'unavailable' };
        }
        const workspaceScalars = readYamlTopLevelScalars(fs.readFileSync(workspaceFile, 'utf8'));
        const schema = workspaceScalars.schemaVersion;
        if (schema !== undefined && schema !== WORKSPACE_SCHEMA_V1 && schema !== '1') {
          return { selectedPath: root, id: null, conflictIds: [], status: 'invalid' };
        }
        const canonicalId = schema === WORKSPACE_SCHEMA_V1 ? workspaceScalars.id : undefined;
        if (schema === WORKSPACE_SCHEMA_V1 && (!canonicalId || !UUID_PATTERN.test(canonicalId))) {
          return { selectedPath: root, id: null, conflictIds: [], status: 'invalid' };
        }
        let skillsId: string | undefined;
        const skillsManifest = path.join(root, 'skills', 'manifest.yml');
        if (fs.existsSync(skillsManifest)) {
          const skillsScalars = readYamlTopLevelScalars(fs.readFileSync(skillsManifest, 'utf8'));
          if (skillsScalars.workspaceId !== undefined) {
            if (!UUID_PATTERN.test(skillsScalars.workspaceId)) {
              return { selectedPath: root, id: null, conflictIds: [], status: 'invalid' };
            }
            skillsId = skillsScalars.workspaceId;
          }
        }
        if (canonicalId && skillsId && canonicalId !== skillsId) {
          return { selectedPath: root, id: canonicalId, conflictIds: [canonicalId, skillsId], status: 'identity_conflict' };
        }
        const id = canonicalId ?? skillsId ?? null;
        if (!id) return { selectedPath: root, id: null, conflictIds: [], status: 'invalid' };
        const name = workspaceScalars.name?.trim() || path.basename(root) || root;
        try {
          const { rootPath, info } = observeDirectory(root);
          const ref: ExecutionScopeRef = { sourceId: BUILDR_SOURCE_ID, id };
          return {
            selectedPath: root,
            id,
            conflictIds: [id],
            name,
            status: 'ready',
            observed: { ref, rootPath, revision: scopeRevision(ref, rootPath, info), name, selectedPath: root },
          };
        } catch {
          return { selectedPath: root, id, conflictIds: [id], name, status: 'unavailable' };
        }
      } catch {
        return { selectedPath: root, id: null, conflictIds: [], status: 'invalid' };
      }
    });
    const byId = new Map<string, ParsedRegistryEntry[]>();
    for (const entry of entries) {
      if (!entry.id) continue;
      const list = byId.get(entry.id) ?? [];
      list.push(entry);
      byId.set(entry.id, list);
    }
    for (const peers of byId.values()) {
      if (peers.length < 2) continue;
      for (const peer of peers) peer.status = 'identity_conflict';
    }
    return entries;
  }

  listRegistered(): LocalRegisteredWorkspace[] {
    return this.readEntries()
      .filter((entry): entry is ParsedRegistryEntry & { status: 'ready'; observed: LocalRegisteredWorkspace } => entry.status === 'ready' && !!entry.observed)
      .map(entry => entry.observed);
  }

  findBySelectedPath(selectedPath: string): LocalRegisteredWorkspace | undefined {
    const normalized = path.resolve(selectedPath);
    return this.listRegistered().find(entry => entry.selectedPath === normalized || samePath(entry.selectedPath, normalized));
  }

  defaultWorkspaceSummary(): { ref: ExecutionScopeRef; name: string; rootPath: string } {
    const raw = resolveLocalDefaultWorkspaceRoot(this.dataRoot);
    const rootPath = fs.existsSync(raw) ? fs.realpathSync(raw) : raw;
    return { ref: { sourceId: BUILDR_SOURCE_ID, id: '@default' }, name: '默认工作空间', rootPath };
  }

  resolveExecutionScope(input: { ref: ExecutionScopeRef; expectedRevision?: string }): ExecutionScope | undefined {
    const { ref, expectedRevision } = input;
    if (ref.sourceId !== BUILDR_SOURCE_ID) return undefined;
    if (ref.id === '@default') {
      const raw = resolveLocalDefaultWorkspaceRoot(this.dataRoot);
      fs.mkdirSync(raw, { recursive: true });
      const { rootPath, info } = observeDirectory(raw);
      const revision = scopeRevision(ref, rootPath, info);
      if (expectedRevision && revision !== expectedRevision) {
        throw new AgentServiceError('agent_scope_binding_changed', '执行环境已变化。', 409);
      }
      return { ref, rootPath, revision };
    }
    const matches = this.readEntries().filter(entry => entry.id === ref.id || entry.conflictIds.includes(ref.id));
    if (!matches.length) return undefined;
    if (matches.some(entry => entry.status === 'identity_conflict') || matches.length > 1) {
      throw new AgentServiceError('agent_scope_binding_changed', '工作空间身份冲突，请核对工作空间登记。', 409);
    }
    const match = matches[0]!;
    if (match.status === 'unavailable' || !match.observed) {
      throw new AgentServiceError('agent_directory_unavailable', '工作空间目录不存在、不可访问或已变化；原记录已保留。', 409);
    }
    if (expectedRevision && match.observed.revision !== expectedRevision) {
      throw new AgentServiceError('agent_scope_binding_changed', '执行环境已变化。', 409);
    }
    return { ref: match.observed.ref, rootPath: match.observed.rootPath, revision: match.observed.revision };
  }
}
