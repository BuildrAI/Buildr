import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { codeRepositoryLabel } from '../../src/features/code/code-source-labels.ts';

export async function runSourceControlJourney({ t, page, workspaceUrl, capture, fixture }: any) {
  const focus = process.env.BUILDR_SOURCE_CONTROL_FOCUS || '';
  if (focus && focus !== 'all' && !focus.split('|').some(part => part && '差异提交历史'.includes(part))) return;

  await t.test('源代码管理查看工作树差异、提交变更并在提交历史中核对记录', async () => {
    const root = page.locator('.code-source-control-page:visible');
    const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${workspaceUrl}/code/source-control`);
    await root.locator('.source-control-repository-copy').first().waitFor();
    await root.locator('.source-control-title .anticon-spin').waitFor({ state: 'hidden' });

    const response = await page.request.get(`${api}/code/source-control`);
    assert.equal(response.status(), 200);
    const observed = await response.json();
    const repository = observed.repositories.find((item: any) =>
      item.worktrees.some((worktree: any) => worktree.location === fixture.location),
    );
    assert.ok(repository, '主工作树应属于已登记代码库');
    const mainWorktree = repository.worktrees.find((worktree: any) => worktree.location === fixture.location);
    assert.ok(mainWorktree);

    await root.getByRole('button', { name: `查看主工作树 · ${codeRepositoryLabel(repository)}`, exact: true }).click();
    const group = root.locator(`[data-change-worktree="${mainWorktree.worktreeId}"]`);
    await group.waitFor({ state: 'visible' });

    const row = group.locator('[data-change-area="working"] .task-changed-row').filter({
      has: page.locator(`.task-changed-path[data-file-path="${fixture.path}"]`),
    });
    await row.click();
    await root.getByRole('region', { name: '差异内容', exact: true }).getByText(fixture.workingText.trim(), { exact: false }).waitFor();
    await capture(page, 'source-control-diff.png');

    const commitMessage = 'browser smoke commit';
    const commitPanel = root.locator('.source-control-commit-panel');
    await commitPanel.getByRole('textbox', { name: '提交说明内容', exact: true }).fill(commitMessage);
    await commitPanel.locator('#commit-changes:not([disabled])').waitFor();
    await commitPanel.locator('#commit-changes').click();
    await commitPanel.locator('.source-control-commit-result').filter({ hasText: '已提交' }).waitFor({ state: 'visible' });

    const gitLog = execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: fixture.location, encoding: 'utf8' }).trim();
    assert.equal(gitLog, commitMessage);

    await root.locator('.source-control-browse-tabs').getByText('提交历史', { exact: true }).click();
    await root.locator('.source-control-graph').filter({ hasText: commitMessage }).waitFor({ state: 'visible' });
  });
}
