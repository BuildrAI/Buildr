import { Button, Tag } from 'antd';
import { DrawerShell } from '../../../components/DrawerShell';
import { formatShortDateTime } from '../../../lib/taskLabels';
import type { ServiceRuntimeSummary } from '../api/service-runtime-api';

export function RuntimeDefinitionDrawer({ service, onClose, onConfigure }: { service: ServiceRuntimeSummary | null; onClose(): void; onConfigure(): void }) {
  const definition = service?.definition;
  return <DrawerShell open={Boolean(service)} onClose={onClose} title="启动配置" sub={service?.name} eyebrow="本地运行" width={680} id="service-runtime-definition-drawer" rootClassName="runtime-definition-drawer" footer={<Button onClick={onConfigure}>交给智能体（Agent）检查配置</Button>}>
    {definition ? <div className="runtime-definition">
      <div className="runtime-source runtime-definition-source"><Tag>智能体（Agent）验证</Tag><span>验证于 {formatShortDateTime(definition.verifiedAt)}</span></div>
      <dl className="runtime-definition-paths">
        <div><dt>运行定义</dt><dd><code>{definition.path}</code></dd></div>
        <div><dt>工作目录</dt><dd><code>{definition.local.cwd}</code>{definition.local.profile ? <Tag>{definition.local.profile}</Tag> : null}</dd></div>
      </dl>
      <section className="runtime-definition-command"><h3>启动命令</h3><p>以下为实际参数数组，顺序和引号保留原始语义。</p><pre aria-label="启动命令参数数组"><code>{JSON.stringify(definition.local.command, null, 2)}</code></pre></section>
      <dl className="runtime-facts runtime-definition-facts">
        <div><dt>首选端口</dt><dd>{definition.local.preferredPort}</dd></div>
        <div><dt>端口覆盖</dt><dd>{definition.local.portOverride ? <code>{definition.local.portOverride}</code> : '未配置覆盖方式'}</dd></div>
        <div><dt>就绪检查</dt><dd>{definition.local.readiness.kind === 'log' ? <>日志出现 <code>{definition.local.readiness.pattern}</code></> : <>HTTP <code>{definition.local.readiness.path}</code> 返回成功</>}</dd></div>
        <div><dt>等待超时</dt><dd>{definition.local.timeoutSeconds} 秒</dd></div>
        {(definition.local.backends ?? []).flatMap(backend => [
          <div key={`${backend.serviceCode}-service`}><dt>后端服务</dt><dd><code>{backend.serviceCode}</code></dd></div>,
          <div key={`${backend.serviceCode}-env`}><dt>目标注入</dt><dd><code>{backend.environmentVariable}</code></dd></div>,
          <div key={`${backend.serviceCode}-remote`}><dt>远程测试环境</dt><dd><code>{backend.remoteUrl}</code></dd></div>,
        ])}
      </dl>
      <p className="runtime-section-note">这是当前已验证配置；已启动实例展示各自的启动快照。页面只读，不直接编辑命令。</p>
    </div> : <p>{service?.definitionDiagnostic || '尚未配置已验证的启动方式。'}</p>}
  </DrawerShell>;
}
