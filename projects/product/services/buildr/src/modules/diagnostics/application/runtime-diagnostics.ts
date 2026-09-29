import { detectManagedRuntimeAdapters, runtimeCommandSelector } from '../../agent-assets/application/runtime-selection.ts';
import { resolveRuntimeSelection } from '../../agent-assets/infrastructure/runtime/adapter-contract.ts';
import { retiredRuntimeProjectionFindings } from '../../agent-assets/infrastructure/runtime/retired-adapters.ts';

export function createRuntimeDiagnostics(deps: any) {
  const {
    RUNTIME_CHECKERS,
    addDoctorFinding,
    componentRegistryPath,
    existsFile,
    managedRuntimeSkillOrphans,
    packageComponentsStatus,
    path,
    runCommandsCheck,
    runtimeImplementation,
    toPosixRelative,
  } = deps;

  function runtimeFindingsForDoctor(findings: any, includeInfo: any) {
    return includeInfo ? findings : findings.filter((finding: any) => finding.status !== 'info');
  }

  function summarizeRuntimeFindings(findings: any) {
    const counts: Record<string, number> = { ok: 0, info: 0, warning: 0, missing: 0, stale: 0, orphan: 0, conflict: 0 };
    for (const finding of findings) {
      counts[finding.status] = (counts[finding.status] ?? 0) + 1;
    }
    return counts;
  }

  const detectManagedRuntimeAgents = detectManagedRuntimeAdapters;

  function diagnoseRuntime(result: any, targetRoot: any, scopes: any, options: any = {}) {
    const includeInfo = options.includeInfo === true;
    const selectedAgent = options.explicitSelection ?? (options.agent != null || options.adapterId != null);
    const detectedAgents = options.detectedAgents ?? detectManagedRuntimeAgents(targetRoot);
    const selections = options.selections ?? (selectedAgent
      ? [resolveRuntimeSelection({ runtimeId: options.agent ?? null, adapterId: options.adapterId ?? null })]
      : detectedAgents.length ? detectedAgents.map((adapterId: string) => resolveRuntimeSelection({ adapterId })) : [resolveRuntimeSelection()]);
    result.agentRuntime.detectedAgents = detectedAgents;
    result.agentRuntime.checkedAgents = selections.map((selection: any) => selection.runtimeId ?? selection.adapterId);
    result.agentRuntime.checkedAdapters = selections.map((selection: any) => selection.adapterId);
    result.agentRuntime.diagnosticMode = selectedAgent ? 'selected-runtime' : 'managed-runtime-inventory';
    const runtimeResultKey = (adapter: any) => adapter.traits.checker.resultKey ?? adapter.id.replace(/-([a-z])/g, (_match: any, letter: any) => letter.toUpperCase());
    result.runtime = Object.fromEntries(selections.map((selection: any) => [runtimeResultKey(selection.adapter), []]));

    const runtimeScopes = scopes.map((item: any) => item.scope);
    const seenFindings = Object.fromEntries(selections.map((selection: any) => [selection.adapterId, new Set()]));
    const dedupeFindings = (agent: any, findings: any) => findings.filter((finding: any) => {
      const key = [finding.code || finding.status, finding.path, finding.expected || '', finding.actual || ''].join('|');
      if (seenFindings[agent].has(key)) return false;
      seenFindings[agent].add(key);
      return true;
    });

    for (const scope of runtimeScopes) {
      for (const selection of selections) {
        const { adapter, adapterId, runtimeId } = selection;
        const agent = runtimeId;
        const checker = runtimeImplementation(adapter, 'checker', RUNTIME_CHECKERS);
        const resultKey = runtimeResultKey(adapter);
        const codeId = (runtimeId ?? adapterId).replaceAll('-', '_');
        try {
          const check = checker(['--scope', scope, '--target', targetRoot], {
            repoRoot: targetRoot,
            runtimeId,
            adapterId,
            command: 'buildr doctor',
          });
          const findings = dedupeFindings(adapterId, runtimeFindingsForDoctor(check.findings, includeInfo));
          result.runtime[resultKey].push({ agent, runtimeId, adapterId, host: selection.host, scope, counts: summarizeRuntimeFindings(findings), findings, skillInventoryEvidence: check.skillInventoryEvidence, activation: check.activation });
          if (findings.some((finding: any) => ['missing', 'stale', 'orphan'].includes(finding.status))) {
            addDoctorFinding(result, 'warning', `runtime.${codeId}_stale`, `${adapter.displayName} runtime 缺失或过期：${scope}`, {
              path: toPosixRelative(targetRoot, check.targetRoot),
              agent,
              runtimeId,
              adapterId,
              userActionRequired: Boolean(selectedAgent),
              suggestion: selectedAgent
                ? `按 doctor 输出的修复命令同步 ${adapter.displayName} runtime；需要 adapter 细节时再运行 runtime check。`
                : `这是未选中 runtime 的 inventory drift；使用该 Agent 时运行 doctor${runtimeId === null ? '' : ` --agent ${runtimeId}`} --adapter ${adapterId} 获取可操作诊断。`,
              ...(selectedAgent ? { commands: check.repairCommands } : {}),
            });
          }
          const runtimeWarnings = findings.filter((finding: any) => finding.status === 'warning');
          if (runtimeWarnings.length > 0) {
            const userActionRequired = Boolean(selectedAgent) && runtimeWarnings.some((finding: any) => finding.userActionRequired !== false);
            const runtimeFindingCodes = [...new Set(runtimeWarnings.map((finding: any) => finding.code).filter(Boolean))];
            const evidenceLevels = [...new Set(runtimeWarnings.map((finding: any) => finding.evidence).filter(Boolean))];
            const opaqueSources = [...new Set(runtimeWarnings.flatMap((finding: any) => finding.opaqueSources || []))];
            addDoctorFinding(result, 'warning', `runtime.${codeId}_warning`, `${adapter.displayName} runtime 存在警告：${scope}`, {
              path: toPosixRelative(targetRoot, check.targetRoot),
              agent,
              runtimeId,
              adapterId,
              userActionRequired,
              runtimeFindingCodes,
              ...(evidenceLevels.length === 1 ? { evidence: evidenceLevels[0] } : evidenceLevels.length > 1 ? { evidence: evidenceLevels } : {}),
              ...(opaqueSources.length > 0 ? { opaqueSources } : {}),
              suggestion: userActionRequired
                ? '优先查看 doctor 输出中的 runtime findings；需要 adapter 细节时再运行 runtime check。'
                : selectedAgent
                  ? '该 warning 未要求用户操作；需要细节时运行 runtime check。'
                  : `这是未选中 runtime 的 inventory evidence；使用该 Agent 时运行 doctor${runtimeId === null ? '' : ` --agent ${runtimeId}`} --adapter ${adapterId} 获取可操作诊断。`,
            });
          }
          if (findings.some((finding: any) => finding.status === 'conflict')) {
            addDoctorFinding(result, selectedAgent ? 'error' : 'warning', selectedAgent ? `runtime.${codeId}_conflict` : `runtime.${codeId}_inventory_conflict`, `${adapter.displayName} runtime 存在非 Buildr 管理或冲突文件：${scope}`, {
              path: toPosixRelative(targetRoot, check.targetRoot),
              agent,
              runtimeId,
              adapterId,
              userActionRequired: Boolean(selectedAgent),
              suggestion: selectedAgent
                ? '将手写内容迁移回 Buildr 资产源，再重新 render。'
                : `这是未选中 runtime 的 inventory conflict；使用该 Agent 时运行 doctor${runtimeId === null ? '' : ` --agent ${runtimeId}`} --adapter ${adapterId} 再处理。`,
            });
          }
          if (includeInfo) {
            for (const finding of findings.filter((item: any) => item.status === 'info')) {
              addDoctorFinding(result, 'info', finding.code ?? 'runtime.info', finding.message, {
                path: finding.path,
                agent,
                runtimeId,
                adapterId,
                impact: finding.impact,
                userActionRequired: finding.userActionRequired,
                repair: finding.repair,
                suggestion: finding.suggestion,
              });
            }
          }
        } catch (error: any) {
          const missingManifest = error.message.startsWith('Manifest not found:');
          const missingCode = adapter.traits.checker.skillsManifestAbsentCode ?? `runtime.${codeId}_skills_manifest_absent`;
          const status = missingManifest ? 'ok' : selectedAgent ? 'error' : 'warning';
          addDoctorFinding(result, status, missingManifest ? missingCode : selectedAgent ? `runtime.${codeId}_unchecked` : `runtime.${codeId}_inventory_unchecked`, missingManifest ? `未声明 ${adapter.displayName} Skills manifest，跳过 Skills runtime 检查：${scope}` : `无法检查 ${adapter.displayName} runtime：${scope}`, missingManifest ? {} : {
            agent,
            runtimeId,
            adapterId,
            userActionRequired: Boolean(selectedAgent),
            suggestion: error.message,
          });
        }
      }
    }
    diagnoseRetiredProjections(result, targetRoot);
  }

  /**
   * 退役适配器（Adapter）遗留投射的报告面：只报告，不阻断。
   * 这些路径不再由任何支持的适配器写入；能证明所有权的已在受管操作中清理，
   * 剩下的是无法证明所有权或无法安全分离的部分，需要人确认后才能删除。
   */
  function diagnoseRetiredProjections(result: any, targetRoot: any) {
    let findings;
    try {
      findings = retiredRuntimeProjectionFindings(targetRoot);
    } catch {
      return;
    }
    for (const finding of findings) {
      addDoctorFinding(result, 'warning', finding.code, finding.message, {
        path: finding.path,
        adapterId: finding.adapterId,
        reason: finding.reason,
        userActionRequired: false,
        suggestion: finding.suggestion,
      });
    }
  }

  function diagnoseCommands(result: any, targetRoot: any, projects: any = []) {
    const commandsResult = runCommandsCheck(targetRoot, { projects });
    result.commandLineTools = commandsResult;
    for (const finding of commandsResult.findings) {
      addDoctorFinding(result, finding.status, finding.code, finding.message, {
        path: finding.path,
        suggestion: finding.suggestion,
        installHint: finding.installHint,
        commandId: finding.commandId,
        executable: finding.executable,
        sources: finding.sources,
        expected: finding.expected,
        actual: finding.actual,
        project: finding.project,
        projects: finding.projects,
        reason: finding.reason,
        provenance: finding.provenance,
        constraints: finding.constraints,
        userActionRequired: finding.userActionRequired,
      });
    }
  }

  function diagnoseComponents(result: any, targetRoot: any, includeInfo: any = false, selectedAgent: any = null, detectedAgents: any = []) {
    if (!existsFile(componentRegistryPath(targetRoot))) {
      addDoctorFinding(result, 'warning', 'components.registry_missing', 'Component registry 缺失。', {
        path: 'components/manifest.yml',
        suggestion: `运行 buildr sync <agent> --target ${targetRoot} 创建 registry、迁移默认 Component 并准备当前 Agent runtime。`,
        command: `buildr sync <agent> --target ${targetRoot}`,
      });
    }
    let status;
    try {
      status = packageComponentsStatus(targetRoot);
    } catch (error: any) {
      result.components = { items: [], ownership: {}, findings: [] };
      addDoctorFinding(result, 'error', 'components.registry_invalid', error.message, {
        path: 'components/manifest.yml',
        suggestion: '修复 Component registry 后重新运行 doctor。',
      });
      return;
    }
    result.components = {
      items: status.components,
      ownership: Object.fromEntries(status.ownership),
      findings: status.findings,
    };
    const componentById = new Map<string, any>(status.components.map((item: any) => [item.id, item]));
    for (const finding of status.findings) {
      const owners = [finding.componentId, ...(finding.owners || [])].filter(Boolean);
      const required = owners.some((id: any) => componentById.get(id)?.required === true);
      addDoctorFinding(result, required ? 'error' : 'warning', finding.code || 'components.invalid', finding.message || `Component ownership conflict: ${finding.member || ''}`, {
        path: finding.member || 'components/manifest.yml',
        componentId: finding.componentId,
        owners: finding.owners,
        suggestion: '修复 Component definition、成员路径或唯一所有权冲突后重试。',
        affectedActions: ['inspect', 'reconcile', 'sync'],
        ownershipUnit: finding.componentId ? `component:${finding.componentId}` : `component-member:${finding.member || 'registry'}`,
      });
    }
    for (const item of status.components) {
      if (['invalid', 'modified', 'missing'].includes(item.status)) {
        addDoctorFinding(result, item.required ? 'error' : 'warning', `components.${item.status}`, `Component ${item.id} 状态异常：${item.status}`, {
          path: `components/${item.id}`,
          componentId: item.id,
          error: item.error,
          members: item.members,
          suggestion: item.status === 'missing'
            ? `运行 buildr component install ${item.id} --agent <agent> --target ${targetRoot}，或确认是否应保留卸载状态。`
            : '检查成员差异；不要通过单项资产命令覆盖 Component 成员。',
          affectedActions: ['reconcile', 'sync'],
          ownershipUnit: `component:${item.id}`,
        });
      } else if (item.status === 'update-available') {
        addDoctorFinding(result, 'warning', 'components.update_available', `Component ${item.id} 有可用更新。`, {
          componentId: item.id,
          expected: item.availableVersion,
          actual: item.installedVersion,
          suggestion: '运行 buildr update，或通过当前 Agent 执行 buildr sync <agent>。',
        });
      } else if (includeInfo) {
        addDoctorFinding(result, 'info', `components.${item.status}`, `Component ${item.id}：${item.status}`, {
          componentId: item.id,
          installedVersion: item.installedVersion,
          availableVersion: item.availableVersion,
        });
      }
    }
    const uninstalledOwners = new Map();
    for (const item of status.components.filter((component: any) => component.status === 'uninstalled')) {
      for (const member of item.members.filter((entry: any) => entry.path.startsWith('skills/'))) uninstalledOwners.set(path.basename(member.path), item.id);
    }
    const componentSelections = selectedAgent
      ? [typeof selectedAgent === 'string' ? resolveRuntimeSelection({ runtimeId: selectedAgent }) : selectedAgent]
      : detectedAgents.map((adapterId: string) => resolveRuntimeSelection({ adapterId }));
    for (const selection of componentSelections) {
      const { adapterId, runtimeId } = selection;
      const agent = runtimeId ?? adapterId;
      let runtimeOrphans;
      try {
        runtimeOrphans = managedRuntimeSkillOrphans(targetRoot, adapterId, { runtimeId });
      } catch (error: any) {
        addDoctorFinding(result, selectedAgent ? 'error' : 'warning', `runtime.${agent.replaceAll('-', '_')}_ownership_receipt_conflict`, `无法确认 ${agent} Skill 投射所有权回执。`, {
          path: '.buildr/agent-runtime',
          agent,
          userActionRequired: Boolean(selectedAgent),
          suggestion: error.message,
        });
        continue;
      }
      for (const orphan of runtimeOrphans) {
        const componentId = uninstalledOwners.get(orphan.runtimePath) || null;
        addDoctorFinding(result, 'warning', 'components.runtime_orphan', componentId
          ? `已卸载 Component ${componentId} 仍有 ${agent} runtime Skill 投射：${orphan.runtimePath}`
          : `Buildr-managed ${agent} runtime Skill 没有有效源资产：${orphan.runtimePath}`, {
          path: orphan.path,
          componentId,
          agent,
          userActionRequired: Boolean(selectedAgent),
          suggestion: `运行 buildr render${runtimeCommandSelector(selection)} --scope . --target ${targetRoot} 清理受管 runtime orphan。`,
          ...(selectedAgent ? { command: `buildr render${runtimeCommandSelector(selection)} --scope . --target ${targetRoot}` } : {}),
        });
      }
    }
  }

  return {
    runtimeFindingsForDoctor,
    summarizeRuntimeFindings,
    detectManagedRuntimeAgents,
    diagnoseRuntime,
    diagnoseCommands,
    diagnoseComponents,
  };
}
