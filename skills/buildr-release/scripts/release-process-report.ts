import fs from 'node:fs';
import path from 'node:path';

/** Reports are derived output, never permission to publish or clean resources. */
export function releaseReportFailures(value: any, phase: string): any[] {
  const failures: any[] = [], seen = new Set();
  const visit = (item: any) => {
    if (!item || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (item.status === 'failed' || item.outcome === 'failed' || item.diagnostic) failures.push({
      checkName: item.checkName ?? item.id ?? item.operation ?? phase,
      errorCode: item.diagnostic?.code ?? item.code ?? null,
      message: item.diagnostic?.message ?? item.message ?? null,
    });
    for (const key of ['checks', 'steps', 'results', 'failures', 'result', 'ownerResult', 'cleanup', 'localSource', 'localPackage', 'artifactObservation']) visit(item[key]);
  };
  visit(value);
  return failures;
}

export function writeReleaseProcessReports(workspace: string, state: any, attempt: any, result: any): any[] {
  const selectionId = state.targets?.selectionId ?? state.version;
  const versions: string[] = [...new Set<string>(Object.values(state.targets?.versions ?? { buildr: state.version }).filter((v: any) => v != null) as string[])];
  const evidence = state.publicationEvidence ?? result.result?.publicationEvidence;
  const context = evidence?.context ?? state.context;
  return versions.map(version => {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) throw new Error('Invalid release report version.');
    const directory = path.join(workspace, 'build/verification/release-process', version);
    const json = path.join(directory, 'release-report.json');
    const previous = fs.existsSync(json) ? JSON.parse(fs.readFileSync(json, 'utf8')) : null;
    if (previous && (previous.schemaVersion !== 'buildr.release-process-report/v1' || previous.selectionId !== selectionId)) throw new Error('Release report identity differs; existing report retained.');
    const names = state.targets?.packages ?? ['buildr'];
    const artifacts = names.filter((name: string) => (state.targets?.versions?.[name] ?? state.version) === version).map((name: string) => {
      const publication = evidence?.publications?.[name] ?? state.packagePublications?.[name]?.evidence;
      const owner = publication?.ownerEvidence ?? (name === 'buildr' ? evidence : null);
      const release = owner?.release;
      const artifact = publication?.registryArtifact ?? context?.packages?.[name]?.artifact ?? context?.artifact;
      // Plugin owners do not currently create a GitHub Release/tag: keep null.
      const confirmed = owner?.status === 'passed' && release?.registryPublished === true && Boolean(release.tagCommit && release.githubRelease);
      return { package: artifact?.packageName ?? name, version,
        npm: { integrity: release?.registryIntegrity ?? artifact?.integrity ?? null,
          sha256: artifact?.artifactSha256 ?? artifact?.sha256 ?? null,
          registryConfirmed: publication?.registryArtifact?.origin === 'registry' || release?.registryPublished === true },
        gitTag: { name: release?.tag ?? null, commit: release?.tagCommit ?? null },
        githubRelease: { url: typeof release?.githubRelease === 'string' ? release.githubRelease : release?.githubRelease?.url ?? null,
          targetCommit: confirmed ? release.tagCommit : null },
        publicationConfirmed: publication ? Boolean(evidence?.status === 'passed') : confirmed,
      };
    });
    const failures = releaseReportFailures(result, attempt.phase);
    const failed = failures.length > 0 || result.run?.conclusion === 'failure' || /failed|blocked|diagnosis-required/u.test(result.status);
    if (failed && failures.length === 0) failures.push({ checkName: attempt.phase, errorCode: null, message: result.status });
    const status = failed ? 'failed' : result.status === 'passed' && artifacts.length > 0 && artifacts.every((item: any) => item.publicationConfirmed) ? 'succeeded' : 'unknown';
    const measurement = state.localReleaseMeasurements ?? null;
    const trackedSource = state.candidate?.sourceCommit ?? state.localPackage?.sourceCommit ?? state.localPackageProduction?.sourceCommit;
    const trackedArtifact = state.localPackage?.artifactSha256 ?? state.localPackageProduction?.artifactSha256;
    const local = names.includes('buildr') && (state.targets?.versions?.buildr ?? state.version) === version
      && measurement && (!trackedSource || measurement.sourceCommit === trackedSource)
      && (!trackedArtifact || !measurement.artifactSha256 || measurement.artifactSha256 === trackedArtifact) ? measurement : null;
    const current = { ...attempt, status, failures, localMeasurements: local, recoveryActions: (result.effects ?? []).filter((effect: any) => /repair|recovery|retry|rerun|reconcil/u.test(effect.type ?? '')) };
    const attempts = [...(previous?.attempts ?? []).filter((item: any) => item.id !== attempt.id), current];
    const phases = attempts.flatMap((item: any) => item.phases);
    const value = { schemaVersion: 'buildr.release-process-report/v1', version, selectionId, status,
      startedAt: attempts[0].startedAt, finishedAt: attempt.finishedAt, timezone: 'UTC', phases,
      failures: attempts.flatMap((item: any, index: number) => item.failures.map((failure: any) => ({
        ...failure, at: item.finishedAt, recoveryActions: attempts.slice(index).flatMap((later: any) => later.recoveryActions),
      }))),
      artifacts, localMeasurements: local, cleanup: result.cleanup ?? state.closeout?.cleanup ?? null, attempts,
    };
    const markdown = [`# 发版记录 ${version}`, '', `状态：${status}`, `开始：${value.startedAt}；结束：${value.finishedAt ?? 'unknown'}（UTC）`, '',
      '| 阶段 | 状态 | 耗时（秒） |', '| --- | --- | --- |',
      ...phases.map((item: any) => `| ${item.phase} | ${item.status} | ${item.durationSeconds ?? 'unknown'} |`),
      '', '## 本机耗时与资源',
      '不同层级的耗时可能重叠，不相加。源码记录保留原轮次，非本次执行计数；资源为采样下界，未测为 unknown。',
      '| 检查或阶段 | 状态 | 执行/原始耗时（毫秒） | 排队（毫秒） | 采样内存（MiB） |', '| --- | --- | ---: | ---: | ---: |',
      ...[...(local?.stages ?? []), ...(local?.package?.stages ?? []), ...(local?.artifactChecks?.preparation ?? []), ...(local?.artifactChecks?.results ?? []).flatMap((node: any) => [node, ...(node.checks ?? [])]), ...(local?.sourceChecks ?? [])].map((item: any) =>
        `| ${String(item.id).replaceAll('|', '\\|')} | ${[item.status, item.disposition ?? item.applicability].filter(Boolean).join(" / ") || "unknown"} | ${item.durationMs ?? 'unknown'} | ${item.queueDurationMs ?? 'unknown'} | ${item.resources?.peakSampledGroupRssBytes == null ? 'unknown' : (item.resources.peakSampledGroupRssBytes / 1048576).toFixed(1)} |`),
      '', '## 安装包构成',
      ...(local?.package?.package ? [
        `压缩 ${local.package.package.compressedBytes} 字节；解包 ${local.package.package.unpackedBytes} 字节；文件 ${local.package.package.fileCount} 个。`,
        '| 组件 | 解包字节 | 文件数 |', '| --- | ---: | ---: |',
        ...local.package.package.components.map((entry: any) => `| ${String(entry.path).replaceAll('|', '\\|')} | ${entry.bytes} | ${entry.files} |`),
        '实际随包依赖声明、后端各入口内联依赖与字节数、最大文件、测试文件、采样 CPU 与进程数以及远端计时见 JSON。未观察到的磁盘、网络和资源不作推断。',
      ] : ['unknown：没有匹配原包的构成记录。']),
      '', '## 失败与修复', '```json', JSON.stringify(value.failures, null, 2), '```',
      '', '## 最终产物', '```json', JSON.stringify(artifacts, null, 2), '```',
      '', '## 清理', '```json', JSON.stringify(value.cleanup, null, 2), '```',
      '', '缺失的原始时间、错误码或产物身份保留为 null/unknown，不推断或补造。', '',
    ].join('\n');
    fs.mkdirSync(directory, { recursive: true });
    for (const [file, content] of [[json, JSON.stringify(value, null, 2) + '\n'], [path.join(directory, 'release-report.md'), markdown]]) {
      const temporary = `${file}.${process.pid}.tmp`;
      try { fs.writeFileSync(temporary, content, { mode: 0o600 }); fs.renameSync(temporary, file); }
      finally { fs.rmSync(temporary, { force: true }); }
    }
    return { version, json, markdown: path.join(directory, 'release-report.md'), status };
  });
}
