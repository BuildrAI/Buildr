import { useEffect, useState } from 'react';
import { Alert, Button, Empty, List, Typography } from 'antd';
import { agentAssetsApi, type AgentAssetsInventory } from '../api/agent-assets-api';
import { useAppShell } from '../../../app/AppShellContext';

export function SkillsPage() {
  const { workspaceId, workspace, setBreadcrumbParts } = useAppShell();
  const [skills, setSkills] = useState<AgentAssetsInventory['skills']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSkills([]);
    void agentAssetsApi.inventory({ signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setSkills(data.skills ?? []);
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '技能读取失败');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, retry]);
  useEffect(() => { setBreadcrumbParts([workspace?.name || '工作空间', '技能']); }, [workspace?.name, setBreadcrumbParts]);
  return (
    <>
      <section className="page-header"><div><Typography.Title level={2}>技能</Typography.Title><p className="page-copy">查看当前工作空间已登记的技能及用途。</p></div></section>
      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setRetry((v) => v + 1)}>重试</Button>} /> : null}
      {!error ? <section className="panel" id="skills-list"><List loading={loading} dataSource={skills}
        locale={{ emptyText: <Empty description="当前工作空间还没有登记技能" /> }}
        renderItem={(skill) => <List.Item><List.Item.Meta
          title={typeof skill.id === 'string' ? skill.id : '未命名技能'}
          description={typeof skill.description === 'string' ? skill.description : '暂无用途说明'} />
        </List.Item>} /></section> : null}
    </>
  );
}
