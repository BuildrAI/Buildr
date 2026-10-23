import { Button, Tag } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { formatShortDateTime } from '../../../lib/taskLabels';
import type { RuntimeDefinitionView } from '../api/service-runtime-api';

type Props = { definition: RuntimeDefinitionView; onView: () => void; onConfigure: () => void };

/** 摘要只呈现已声明的连接，不据此推断服务类型或连接状态。 */
export function RuntimeConfigurationSummary({ definition, onView, onConfigure }: Props) {
  const backends = definition.local.backends ?? [];
  return <div className="runtime-source runtime-configuration-summary" id="service-runtime-configuration">
    <div className="runtime-configuration-heading">
      <h3>启动与连接配置</h3>
      <div className="runtime-configuration-actions">
        <Button size="small" onClick={onView}>查看配置</Button>
        <Button size="small" icon={<SettingOutlined />} onClick={onConfigure}>配置启动与连接</Button>
      </div>
    </div>
    {backends.length ? <dl className="runtime-configuration-connections">
      {backends.flatMap(backend => [
        <div key={`${backend.serviceCode}-service`}><dt>本地后端</dt><dd><code>{backend.serviceCode}</code></dd></div>,
        <div key={`${backend.serviceCode}-remote`}><dt>{backend.kind === 'service-discovery' ? '服务发现（Service Discovery）' : '远程测试地址'}</dt><dd><code>{backend.kind === 'service-discovery' ? `${backend.serviceId} · QA` : backend.remoteUrl}</code></dd></div>,
      ])}
    </dl> : <p className="runtime-connection-note">未声明可切换的后端连接，按现有启动配置运行。</p>}
    <div className="runtime-configuration-source"><Tag>智能体（Agent）验证</Tag><span>运行定义 <code>{definition.path}</code></span><span>验证于 {formatShortDateTime(definition.verifiedAt)}</span></div>
  </div>;
}
