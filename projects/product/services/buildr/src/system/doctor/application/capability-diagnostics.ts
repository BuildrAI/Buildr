export function createCapabilityDiagnostics({ addDoctorFinding, isSupportedAgent, path, resolveSkillCapabilityGraph }: any) {
  function publicContract(contract: any) {
    if (!contract) return null;
    const { absolutePath: _absolutePath, ...value } = contract;
    return value;
  }

  function publicConsumer(consumer: any) {
    return {
      ...consumer,
      dependencies: (consumer.dependencies || []).map((dependency: any) => ({
        ...dependency,
        contract: publicContract(dependency.contract),
        rootCause: dependency.rootCause ? publicConsumer(dependency.rootCause) : null,
      })),
    };
  }

  function diagnoseSkillCapabilities(result: any, targetRoot: any, scopes: any, requestedAgent: any) {
    const runtimeId = requestedAgent && isSupportedAgent(requestedAgent) ? requestedAgent : 'codex';
    const targets = [{ scope: '.', projectRoot: null }];
    for (const scope of scopes) {
      if (!scope.project) continue;
      const scopeId = `projects/${scope.project}`;
      if (!targets.some((item: any) => item.scope === scopeId)) targets.push({ scope: scopeId, projectRoot: path.join(targetRoot, scopeId) });
    }
    result.capabilities = { structurallyRoutableOnly: true, graphs: [], items: [] };
    for (const target of targets) {
      try {
        const graph = resolveSkillCapabilityGraph(targetRoot, target.projectRoot, { runtime: runtimeId, scope: target.scope });
        const consumers = graph.consumers.map(publicConsumer);
        result.capabilities.graphs.push({
          schemaVersion: graph.schemaVersion,
          scope: graph.scope,
          runtime: graph.runtime,
          contracts: graph.contracts.map(publicContract),
          bindings: graph.bindings,
          consumers,
          structurallyRoutableOnly: true,
        });
        for (const consumer of consumers) {
          result.capabilities.items.push(consumer);
          for (const dependency of consumer.dependencies.filter((item: any) => item.readiness !== 'ready')) {
            addDoctorFinding(result, dependency.mode === 'required' ? 'error' : 'info', `capability.${dependency.reason}`, `${dependency.consumer} 的 ${dependency.capability}@${dependency.version} 为 ${dependency.readiness}；ready 仅表示结构可路由。`, {
              path: dependency.consumerScope,
              consumer: dependency.consumer,
              capability: dependency.capability,
              version: dependency.version,
              mode: dependency.mode,
              readiness: dependency.readiness,
              reason: dependency.reason,
              candidates: dependency.candidates,
              selectedProvider: dependency.selectedProvider,
              rootCause: dependency.rootCause,
              nextActions: dependency.nextActions,
              suggestion: dependency.nextActions[0] || '检查 capability contract、provider 声明与 binding。',
              userActionRequired: dependency.mode === 'required',
            });
          }
        }
      } catch (error: any) {
        addDoctorFinding(result, 'error', 'capability.graph_invalid', `Capability graph 无法解析：${error.message}`, {
          path: target.scope,
          suggestion: '修复 Skills manifest 或 capability contract integrity 后重新运行 doctor。',
          userActionRequired: true,
        });
      }
    }
  }

  function printCapabilityReport(result: any) {
    if (!result.capabilities?.graphs?.some((graph: any) => graph.consumers.length > 0)) return;
    console.log('');
    console.log('Capability readiness（ready 只表示结构可路由）：');
    for (const graph of result.capabilities.graphs) {
      for (const consumer of graph.consumers) {
        console.log(`  [${consumer.readiness}] ${graph.scope}:${consumer.consumer}${consumer.reason ? ` reason=${consumer.reason}` : ''}`);
        for (const dependency of consumer.dependencies) {
          const candidates = dependency.candidates.map((candidate: any) => `${candidate.id}@${candidate.scope}${candidate.runtimeAvailable === false ? '(runtime unavailable)' : ''}`).join(', ') || 'none';
          console.log(`    ${dependency.capability}@${dependency.version} mode=${dependency.mode} readiness=${dependency.readiness} reason=${dependency.reason || 'none'} selected=${dependency.selectedProvider?.id || 'none'} candidates=${candidates}`);
          for (const action of dependency.nextActions) console.log(`      next: ${action}`);
        }
      }
    }
  }

  return { diagnoseSkillCapabilities, printCapabilityReport };
}
