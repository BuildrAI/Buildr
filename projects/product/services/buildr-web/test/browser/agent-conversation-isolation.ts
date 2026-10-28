/**
 * 工作空间打开仍经过真实服务，仅允许预先准备的测试空间；
 * 其他未模拟写入不得污染复用现场。
 */
export async function guardConversationServerWrite(route: any, blocked: string[], workspaceIds: readonly string[]): Promise<void> {
  const request = route.request();
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    await route.continue();
    return;
  }
  const description = `${request.method()} ${new URL(request.url()).pathname}`;
  if (description === 'POST /api/v1/workspaces/open') {
    let workspaceId: unknown;
    try { workspaceId = request.postDataJSON()?.workspaceId; } catch { /* reject malformed input */ }
    if (typeof workspaceId === 'string' && workspaceIds.includes(workspaceId)) {
      // Preserve the browser's normal navigation/cancellation behavior.
      // The caller checks resource adoption before and after each group.
      await route.continue();
      return;
    }
  }
  const visit = new URL(request.url()).pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/workbench\/visits$/);
  if (request.method() === 'POST' && visit && workspaceIds.includes(decodeURIComponent(visit[1]))) {
    try {
      const response = await route.fetch({ timeout: 10_000 });
      if (!response.ok()) blocked.push(`${description} failed`);
      await route.fulfill({ response });
    } catch (error) {
      blocked.push(`${description} could not be confirmed: ${error instanceof Error ? error.message : String(error)}`);
      await route.abort();
    }
    return;
  }
  blocked.push(description);
  await route.fulfill({
    status: 409,
    json: { error: { code: 'conversation_fixture_unmocked_write', message: '对话测试不允许未隔离的服务端写入。' } },
  });
}

/** 只清理本组产生的最近访问；出现其他状态变化时保留现场并停止复用。 */
export function resetConversationVisits(application: any, roots: readonly string[]): void {
  const snapshots = roots.map(root => ({ root, items: application.inspectWorkbenchPreferences(root).items }));
  if (snapshots.some(snapshot => snapshot.items.some((item: any) => item.kind !== 'recent-resource'))) {
    throw new Error('共享对话现场出现非最近访问的工作台状态。');
  }
  for (const snapshot of snapshots) {
    for (const item of snapshot.items) application.removeWorkbenchPreference(snapshot.root, item.kind, item.key);
  }
  for (const root of roots) {
    if (application.inspectWorkbenchPreferences(root).items.length) throw new Error('共享对话现场的最近访问未清理。');
  }
}
