import { Alert, Input } from 'antd';
import { ScanOutlined } from '@ant-design/icons';
import { CopyButton } from '../../../components/CopyButton';

type Props = {
  prompt: string;
  serviceCode: string | null;
  workspaceName?: string;
  tone?: 'info' | 'warning' | 'error';
  reason?: string;
  /** 该服务已有进行中的交接：只说明状态，不再提供第二次提交。 */
  inProgress?: boolean;
};

/** 执行前的交接正文：目标、步骤、授权影响和完成后的查看位置先于任何提交。 */
export function AgentDiscoveryContent({
  prompt,
  serviceCode,
  workspaceName,
  tone = 'info',
  reason = '确认后才会创建对话并提交配置请求。',
  inProgress = false,
}: Props) {
  return <div className="discovery-drawer">
    <Alert
      type={inProgress ? 'info' : tone}
      showIcon
      icon={<ScanOutlined />}
      message={inProgress ? '配置进行中 · 已交接给原对话' : '尚未执行配置'}
      description={inProgress
        ? <>该服务的运行配置仍在原对话中执行；此处不会再提交新的配置请求。可回到原对话查看进展或回答智能体的请求。<br />完成标志：本次执行正常结束且 Buildr 读到可用运行定义，服务页会显示“未运行”和“启动”。</>
        : <>{reason}<br />完成标志：本次执行正常结束且 Buildr 读到可用运行定义，服务页会显示“未运行”和“启动”。</>}
    />
    {workspaceName ? <p className="discovery-target"><span>工作空间</span><strong>{workspaceName}</strong></p> : null}
    <section className="discovery-summary" aria-label="配置内容">
      <h3>智能体将完成</h3>
      <ul className="discovery-steps">
        <li>核对服务登记、真实代码和已有运行定义</li>
        <li>验证本地启动方式及实际需要的连接</li>
        <li>保存并读回配置，说明验证结果与剩余缺口</li>
      </ul>
    </section>
    <section className="discovery-impact-block" aria-label="本次允许的影响">
      <h3>本次允许的影响</h3>
      <ul className="discovery-impact">
        <li>本地候选启动和只读验证，并按差异更新 <code>services/{serviceCode || '<service-code>'}/runtime.yml</code></li>
        <li>不包括远程业务写入、部署、共享配置修改或凭证读取</li>
        <li>已有实例不会因为保存新配置而自动重启</li>
      </ul>
    </section>
    {!prompt ? <Alert type="warning" showIcon message="当前工作空间路径或服务身份尚未读取，请关闭后重试。" /> : null}
    <details className="discovery-prompt">
      <summary>查看完整指令</summary>
      <div className="discovery-prompt-body">
        <div className="discovery-prompt-actions">
          <CopyButton type="text" text={prompt} disabled={!prompt} failureMessage="自动复制失败，请展开指令并选择文本复制。">复制完整指令</CopyButton>
        </div>
        <div className="config-field">
          <Input.TextArea aria-label="运行配置指令" value={prompt} readOnly autoSize={{ minRows: 6, maxRows: 10 }} />
        </div>
      </div>
    </details>
    <div className="discovery-note">配置完成不等于服务已启动或业务验证通过；实际验证结果以对话为准。复制指令不会执行配置。</div>
  </div>;
}
