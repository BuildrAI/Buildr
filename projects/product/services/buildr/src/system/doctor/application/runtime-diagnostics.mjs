export function createRuntimeDiagnostics(deps) {
  const {
    RUNTIME_CHECKERS,
    SUPPORTED_AGENT_IDS,
    UNSUPPORTED_AGENT_GUIDANCE,
    addDoctorFinding,
    assembleRuntimeProjection,
    componentRegistryPath,
    existsFile,
    fs,
    getRuntimeAdapter,
    isSupportedAgent,
    managedRuntimeSkillOrphans,
    packageComponentsStatus,
    path,
    runCommandsCheck,
    runtimeImplementation,
    toPosixRelative,
  } = deps;

  function runtimeFindingsForDoctor(findings, includeInfo) {
    return includeInfo ? findings : findings.filter((finding) => finding.status !== 'info');
  }

  function summarizeRuntimeFindings(findings) {
    const counts = { ok: 0, info: 0, warning: 0, missing: 0, stale: 0, orphan: 0, conflict: 0 };
    for (const finding of findings) {
      counts[finding.status] = (counts[finding.status] ?? 0) + 1;
    }
    return counts;
  }

  function addUnsupportedAgentFinding(result, agent) {
    addDoctorFinding(result, 'warning', 'runtime.agent_unsupported', `${UNSUPPORTED_AGENT_GUIDANCE.message}${UNSUPPORTED_AGENT_GUIDANCE.nextStep}`, {
      path: '.',
      agent,
      supportedAgents: SUPPORTED_AGENT_IDS,
      userActionRequired: true,
      mustNotUseFallbackAdapter: true,
      suggestion: UNSUPPORTED_AGENT_GUIDANCE.nextStep,
    });
  }

  function directoryContainsJson(root) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return false;
    const pending = [root];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        if (entry.isFile() && entry.name.endsWith('.json')) return true;
        if (entry.isDirectory()) pending.push(path.join(current, entry.name));
      }
    }
    return false;
  }

  function managedPlanTargetExists(item) {
    if (!item?.targetFile || typeof item.isManaged !== 'function' || !fs.existsSync(item.targetFile)) return false;
    const stat = fs.lstatSync(item.targetFile);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    return item.isManaged(fs.readFileSync(item.targetFile, 'utf8'));
  }

  function detectManagedRuntimeAgents(targetRoot) {
    return SUPPORTED_AGENT_IDS.filter((agent) => {
      const adapter = getRuntimeAdapter(agent);
      const runtimeRoot = path.join(targetRoot, adapter.traits.skills.root);
      if (directoryContainsJson(path.join(targetRoot, '.buildr', 'agent-runtime', 'workspace', agent, 'skill-projection-ownership-receipts'))) return true;
      if (directoryContainsJson(path.join(runtimeRoot, 'buildr', 'skill-projection-receipts', agent))) return true;
      if (directoryContainsJson(path.join(runtimeRoot, 'buildr', 'skill-satisfaction', agent))) return true;
      try {
        const { plan } = assembleRuntimeProjection({
          repoRoot: targetRoot,
          targetRoot,
          adapterId: agent,
          scope: '.',
          selection: { rules: true },
        });
        return [...plan.writes, ...plan.removals].some(managedPlanTargetExists);
      } catch {
        return false;
      }
    });
  }

  function diagnoseRuntime(result, targetRoot, scopes, options = {}) {
    const includeInfo = options.includeInfo === true;
    const selectedAgent = options.agent || null;
    const detectedAgents = options.detectedAgents || detectManagedRuntimeAgents(targetRoot);
    const checkedAgents = selectedAgent && isSupportedAgent(selectedAgent) ? [selectedAgent] : selectedAgent ? [] : detectedAgents;
    result.agentRuntime.detectedAgents = detectedAgents;
    result.agentRuntime.checkedAgents = checkedAgents;
    result.agentRuntime.diagnosticMode = selectedAgent ? 'selected-runtime' : 'managed-runtime-inventory';
    const runtimeResultKey = (agent) => getRuntimeAdapter(agent).traits.checker.resultKey ?? agent.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    result.runtime = Object.fromEntries(SUPPORTED_AGENT_IDS.map((agent) => [runtimeResultKey(agent), []]));
    if (selectedAgent && !isSupportedAgent(selectedAgent)) {
      addUnsupportedAgentFinding(result, selectedAgent);
      return;
    }

    const runtimeScopes = scopes.map((item) => item.scope);
    const seenFindings = Object.fromEntries(SUPPORTED_AGENT_IDS.map((agent) => [agent, new Set()]));
    const dedupeFindings = (agent, findings) => findings.filter((finding) => {
      const key = [finding.code || finding.status, finding.path, finding.expected || '', finding.actual || ''].join('|');
      if (seenFindings[agent].has(key)) return false;
      seenFindings[agent].add(key);
      return true;
    });

    for (const scope of runtimeScopes) {
      for (const agent of checkedAgents) {
        const adapter = getRuntimeAdapter(agent);
        const checker = runtimeImplementation(adapter, 'checker', RUNTIME_CHECKERS);
        const resultKey = runtimeResultKey(agent);
        const codeId = agent.replaceAll('-', '_');
        try {
          const check = checker(['--scope', scope, '--target', targetRoot], {
            repoRoot: targetRoot,
            adapterId: adapter.id,
            command: 'buildr doctor',
          });
          const findings = dedupeFindings(agent, runtimeFindingsForDoctor(check.findings, includeInfo));
          result.runtime[resultKey].push({ agent, scope, counts: summarizeRuntimeFindings(findings), findings, skillInventoryEvidence: check.skillInventoryEvidence, environmentChecks: check.environmentChecks, activation: check.activation });
          if (findings.some((finding) => ['missing', 'stale', 'orphan'].includes(finding.status))) {
            addDoctorFinding(result, 'warning', `runtime.${codeId}_stale`, `${adapter.displayName} runtime 缺失或过期：${scope}`, {
              path: toPosixRelative(targetRoot, check.targetRoot),
              agent,
              userActionRequired: Boolean(selectedAgent),
              suggestion: selectedAgent
                ? `按 doctor 输出的修复命令同步 ${adapter.displayName} runtime；需要 adapter 细节时再运行 runtime check。`
                : `这是未选中 runtime 的 inventory drift；使用该 Agent 时运行 doctor --agent ${agent} 获取可操作诊断。`,
              ...(selectedAgent ? { commands: check.repairCommands } : {}),
            });
          }
          const runtimeWarnings = findings.filter((finding) => finding.status === 'warning');
          if (runtimeWarnings.length > 0) {
            const userActionRequired = Boolean(selectedAgent) && runtimeWarnings.some((finding) => finding.userActionRequired !== false);
            const runtimeFindingCodes = [...new Set(runtimeWarnings.map((finding) => finding.code).filter(Boolean))];
            const evidenceLevels = [...new Set(runtimeWarnings.map((finding) => finding.evidence).filter(Boolean))];
            const opaqueSources = [...new Set(runtimeWarnings.flatMap((finding) => finding.opaqueSources || []))];
            addDoctorFinding(result, 'warning', `runtime.${codeId}_warning`, `${adapter.displayName} runtime 存在警告：${scope}`, {
              path: toPosixRelative(targetRoot, check.targetRoot),
              agent,
              userActionRequired,
              runtimeFindingCodes,
              ...(evidenceLevels.length === 1 ? { evidence: evidenceLevels[0] } : evidenceLevels.length > 1 ? { evidence: evidenceLevels } : {}),
              ...(opaqueSources.length > 0 ? { opaqueSources } : {}),
              suggestion: userActionRequired
                ? '优先查看 doctor 输出中的 runtime findings；需要 adapter 细节时再运行 runtime check。'
                : selectedAgent
                  ? '该 warning 未要求用户操作；需要细节时运行 runtime check。'
                  : `这是未选中 runtime 的 inventory evidence；使用该 Agent 时运行 doctor --agent ${agent} 获取可操作诊断。`,
            });
          }
          if (findings.some((finding) => finding.status === 'conflict')) {
            addDoctorFinding(result, selectedAgent ? 'error' : 'warning', selectedAgent ? `runtime.${codeId}_conflict` : `runtime.${codeId}_inventory_conflict`, `${adapter.displayName} runtime 存在非 Buildr 管理或冲突文件：${scope}`, {
              path: toPosixRelative(targetRoot, check.targetRoot),
              agent,
              userActionRequired: Boolean(selectedAgent),
              suggestion: selectedAgent
                ? '将手写内容迁移回 Buildr 资产源，再重新 render。'
                : `这是未选中 runtime 的 inventory conflict；使用该 Agent 时运行 doctor --agent ${agent} 再处理。`,
            });
          }
          if (includeInfo) {
            for (const finding of findings.filter((item) => item.status === 'info')) {
              addDoctorFinding(result, 'info', finding.code ?? 'runtime.info', finding.message, {
                path: finding.path,
                agent,
                impact: finding.impact,
                userActionRequired: finding.userActionRequired,
                repair: finding.repair,
                suggestion: finding.suggestion,
              });
            }
          }
        } catch (error) {
          const missingManifest = error.message.startsWith('Manifest not found:');
          const missingCode = adapter.traits.checker.skillsManifestAbsentCode ?? `runtime.${codeId}_skills_manifest_absent`;
          const status = missingManifest ? 'ok' : selectedAgent ? 'error' : 'warning';
          addDoctorFinding(result, status, missingManifest ? missingCode : selectedAgent ? `runtime.${codeId}_unchecked` : `runtime.${codeId}_inventory_unchecked`, missingManifest ? `未声明 ${adapter.displayName} Skills manifest，跳过 Skills runtime 检查：${scope}` : `无法检查 ${adapter.displayName} runtime：${scope}`, missingManifest ? {} : {
            agent,
            userActionRequired: Boolean(selectedAgent),
            suggestion: error.message,
          });
        }
      }
    }
  }

  function diagnoseCommands(result, targetRoot, projects = []) {
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

  function diagnoseComponents(result, targetRoot, includeInfo = false, selectedAgent = null, detectedAgents = []) {
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
    } catch (error) {
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
    for (const finding of status.findings) {
      addDoctorFinding(result, 'error', finding.code || 'components.invalid', finding.message || `Component ownership conflict: ${finding.member || ''}`, {
        path: finding.member || 'components/manifest.yml',
        componentId: finding.componentId,
        owners: finding.owners,
        suggestion: '修复 Component definition、成员路径或唯一所有权冲突后重试。',
      });
    }
    for (const item of status.components) {
      if (['invalid', 'modified', 'missing'].includes(item.status)) {
        addDoctorFinding(result, 'error', `components.${item.status}`, `Component ${item.id} 状态异常：${item.status}`, {
          path: `components/${item.id}`,
          componentId: item.id,
          error: item.error,
          members: item.members,
          suggestion: item.status === 'missing'
            ? `运行 buildr component install ${item.id} --agent <agent> --target ${targetRoot}，或确认是否应保留卸载状态。`
            : '检查成员差异；不要通过单项资产命令覆盖 Component 成员。',
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
    for (const item of status.components.filter((component) => component.status === 'uninstalled')) {
      for (const member of item.members.filter((entry) => entry.path.startsWith('skills/'))) uninstalledOwners.set(path.basename(member.path), item.id);
    }
    const componentRuntimeAgents = selectedAgent
      ? isSupportedAgent(selectedAgent) ? [selectedAgent] : []
      : detectedAgents;
    for (const agent of componentRuntimeAgents) {
      let runtimeOrphans;
      try {
        runtimeOrphans = managedRuntimeSkillOrphans(targetRoot, agent);
      } catch (error) {
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
          suggestion: `运行 buildr render ${agent} --scope . --target ${targetRoot} 清理受管 runtime orphan。`,
          ...(selectedAgent ? { command: `buildr render ${agent} --scope . --target ${targetRoot}` } : {}),
        });
      }
    }
  }

  return {
    runtimeFindingsForDoctor,
    summarizeRuntimeFindings,
    addUnsupportedAgentFinding,
    detectManagedRuntimeAgents,
    diagnoseRuntime,
    diagnoseCommands,
    diagnoseComponents,
  };
}
