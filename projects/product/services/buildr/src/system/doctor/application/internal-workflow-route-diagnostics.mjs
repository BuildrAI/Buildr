const CONSUMERS = Object.freeze([
  Object.freeze({ path: 'resources/workspace/skills/buildr/task-development/SKILL.md', routes: Object.freeze(['task-development', 'task-planning-identity']), retainedInvocation: true }),
  Object.freeze({ path: 'resources/workspace/skills/buildr/task-retrospective/SKILL.md', routes: Object.freeze(['task-retrospective']), retainedInvocation: true }),
  Object.freeze({ path: 'resources/workspace/skills/buildr/openspec-contract-guard/SKILL.md', routes: Object.freeze(['task-planning-identity']), retainedInvocation: true }),
  Object.freeze({ path: 'resources/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md', routes: Object.freeze(['task-planning-identity']), retainedInvocation: true }),
  Object.freeze({ path: 'resources/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md', routes: Object.freeze(['task-planning-identity']), retainedInvocation: true }),
  Object.freeze({ path: 'resources/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md', routes: Object.freeze(['task-planning-identity']), retainedInvocation: true }),
]);

export function createInternalWorkflowRouteDiagnostics({ addDoctorFinding, fs, path, productRoot, inspectRoutes }) {
  function diagnoseInternalWorkflowRoutes(result) {
    let inventory;
    try {
      inventory = inspectRoutes();
      const ids = inventory.routes?.map((route) => route.id) || [];
      if (inventory.status !== 'ready' || ids.length === 0 || new Set(ids).size !== ids.length) throw new Error('route inventory is empty, duplicated, or not ready');
      for (const route of inventory.routes) {
        if (!route.runner || !['read-only', 'read-write'].includes(route.mode)) throw new Error(`route ${route.id || '<missing>'} has no runner binding`);
      }
    } catch (error) {
      addDoctorFinding(result, 'error', 'product.internal_workflow_routes_invalid', `Buildr内部工作流route inventory无效：${error.message}`, {
        suggestion: '更新到包含完整internal workflow routes的Buildr安装产物。',
        userActionRequired: true,
      });
      return;
    }

    const routeIds = new Set(inventory.routes.map((route) => route.id));
    const root = productRoot();
    const failures = [];
    for (const consumer of CONSUMERS) {
      const file = path.join(root, consumer.path);
      let content;
      try { content = fs.readFileSync(file, 'utf8'); }
      catch { failures.push(`${consumer.path}:missing`); continue; }
      for (const route of consumer.routes) {
        if (!routeIds.has(route) || !content.includes(`__internal ${route}`)) failures.push(`${consumer.path}:${route}`);
      }
      if (consumer.retainedInvocation && !/retained[^\n]{0,80}(?:controller|Buildr)|controllerInvocation/u.test(content)) failures.push(`${consumer.path}:retained-controller`);
      if (/src\/(?:interfaces\/internal\/task-(?:development|planning-identity)-driver|task\/interfaces\/internal\/task-retrospective-driver)\.mjs/u.test(content)) failures.push(`${consumer.path}:source-driver`);
    }
    if (failures.length) addDoctorFinding(result, 'error', 'product.internal_workflow_route_closure_invalid', 'Buildr受管Skill与bundled internal workflow routes不闭合。', {
      failures,
      suggestion: '更新或重新安装matching Buildr package；不要用development checkout的source driver兼容写入。',
      userActionRequired: true,
    });
  }

  return { diagnoseInternalWorkflowRoutes };
}
