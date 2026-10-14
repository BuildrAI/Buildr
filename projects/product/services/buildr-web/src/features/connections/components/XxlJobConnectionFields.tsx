import { Alert, Checkbox } from 'antd';
import { xxlJobWebsiteIdentity, type XxlJobConnectionDraft } from '../xxl-job-connection-form';

type Props = {
  draft: XxlJobConnectionDraft;
  disabled: boolean;
  previousConsoleUrl?: string;
  onChange<K extends keyof XxlJobConnectionDraft>(field: K, value: XxlJobConnectionDraft[K]): void;
};

export function XxlJobConnectionFields({ draft, disabled, previousConsoleUrl, onChange }: Props) {
  let websiteChanged = false;
  try { if (previousConsoleUrl) websiteChanged = xxlJobWebsiteIdentity(draft.consoleUrl) !== xxlJobWebsiteIdentity(previousConsoleUrl); } catch { /* Invalid addresses cannot be saved. */ }
  return <>
    <div className="buildr-nacos-production">
      <Checkbox id="xxl-job-connection-production" checked={draft.production} disabled={disabled} onChange={event => onChange('production', event.target.checked)}>生产连接</Checkbox>
      <p className="buildr-connections-muted">生产连接的配置修改、启停和手动触发需要本次授权。若属于测试环境，请取消勾选。</p>
    </div>
    {draft.production && <Alert type="info" showIcon message="生产操作前，智能体（Agent）会展示具体目标和差异或执行参数，再取得你的授权。" />}
    {websiteChanged && draft.serviceBindings.length > 0 && <Alert type="warning" showIcon message="网站地址已变化，保存后将清除本机服务（Service）关联，由智能体（Agent）重新核实执行器（Executor）。原网站中的任务不受影响。" />}
    <p className="buildr-connections-muted">智能体（Agent）根据环境和服务（Service）的代码与配置核对对应执行器（Executor），再操作其中的调度任务（Job）。查看任务时打开原网站。</p>
  </>;
}
