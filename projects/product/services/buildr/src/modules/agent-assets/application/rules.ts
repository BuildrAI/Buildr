import fs from 'node:fs';
import path from 'node:path';

export interface RulesDependencies {
  rootRequiredBlockStatus: typeof import('../../../infrastructure/filesystem/required-block.ts').rootRequiredBlockStatus;
  addDoctorFinding: typeof import('../../../infrastructure/contracts/diagnostic-finding.ts').addDoctorFinding;
  parseYamlDocument: typeof import('../../../infrastructure/filesystem/yaml.ts').parseYamlDocument;
  toPosixRelative: (root: string, file: string) => string;
  existsFile: (file: string) => boolean;
}

export function registerDomainsRules(dependencies: RulesDependencies) {
  const {
    rootRequiredBlockStatus,
    addDoctorFinding,
    parseYamlDocument,
    toPosixRelative,
    existsFile,
  } = dependencies;

  function listMarkdownFiles(rootDir: string): string[] {
    let rootStat: fs.Stats | undefined;
    try { rootStat = fs.lstatSync(rootDir, { throwIfNoEntry: false }); } catch { return []; }
    if (!rootStat || rootStat.isSymbolicLink()) return [];
    if (!rootStat.isDirectory()) return [];
    let entries: string[];
    try { entries = fs.readdirSync(rootDir).sort(); } catch { return []; }
    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = path.join(rootDir, entry);
      let stat: fs.Stats | undefined;
      try { stat = fs.lstatSync(entryPath, { throwIfNoEntry: false }); } catch { continue; }
      if (!stat) continue;
      if (stat.isDirectory()) files.push(...listMarkdownFiles(entryPath));
      else if (entry.endsWith('.md')) files.push(entryPath);
    }
    return files;
  }

  function inspectRetiredRuleAssets(targetRoot: string) {
    const manifestPath = path.join(targetRoot, 'rules', 'manifest.yml');
    const manifest: any = {
      path: 'rules/manifest.yml',
      exists: existsFile(manifestPath),
      valid: false,
      entryCount: 0,
    };
    let entries: any[] = [];
    if (manifest.exists) {
      try {
        const parsed = parseYamlDocument(fs.readFileSync(manifestPath, 'utf8'), 'rules/manifest.yml');
        manifest.valid = Boolean(parsed) && Array.isArray(parsed.rules);
        entries = manifest.valid ? parsed.rules : [];
        manifest.entryCount = entries.length;
      } catch {
        manifest.valid = false;
      }
    }
    const files = listMarkdownFiles(path.join(targetRoot, 'rules')).map((file) => toPosixRelative(targetRoot, file));
    return { manifest, entries, files };
  }

  function diagnoseRules(result: any, targetRoot: string): void {
    const requiredStatus = rootRequiredBlockStatus(targetRoot);
    result.workspace.requiredBlock = requiredStatus;
    if (!requiredStatus.valid) {
      addDoctorFinding(result, 'warning', 'rules.required_block_invalid', '根 AGENTS.md 缺少或破坏 Buildr required block。', {
        path: 'AGENTS.md',
        suggestion: '运行 buildr update 或 buildr sync 恢复 required block；该操作只修复 Buildr block，不覆盖用户正文。',
      });
    }

    const retired = inspectRetiredRuleAssets(targetRoot);
    result.rules = {
      retired: true,
      manifest: retired.manifest,
      fileCount: retired.files.length,
    };

    if (retired.manifest.exists && !retired.manifest.valid) {
      addDoctorFinding(result, 'warning', 'rules.retired_manifest_invalid', 'rules/manifest.yml 已退役且当前无法解析；文件已保留。', {
        path: retired.manifest.path,
        suggestion: '将需要生效的规则正文迁移到组织根、项目或服务目录的 AGENTS.md 后，再按需删除旧清单。',
        userActionRequired: false,
      });
    } else if (retired.entries.length > 0) {
      addDoctorFinding(result, 'warning', 'rules.retired_manifest_entries', `rules/manifest.yml 仍有 ${retired.entries.length} 个登记项；Rule 资产登记机制已退役。`, {
        path: retired.manifest.path,
        suggestion: '将需要生效的规则正文迁移到组织根、项目或服务目录的 AGENTS.md；迁移完成后可删除旧登记项。',
        userActionRequired: false,
      });
    }

    if (retired.files.length > 0) {
      addDoctorFinding(result, 'warning', 'rules.retired_files', `rules/ 目录中的 ${retired.files.length} 个 Markdown 文件不会再自动生效。`, {
        path: 'rules',
        suggestion: '将需要生效的规则正文迁移到对应 AGENTS.md；文件已保留，不会被自动删除。',
        userActionRequired: false,
      });
    }
  }

  return Object.freeze({
    inspectRetiredRuleAssets,
    diagnoseRules,
  });
}
