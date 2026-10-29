import { Alert, Input } from 'antd';
import { ScanOutlined } from '@ant-design/icons';

export function AgentDiscoveryContent({ prompt, tone, reason }: { prompt: string; tone: 'info' | 'warning' | 'error'; reason: string }) {
  return <div className="discovery-drawer">
    <Alert
      type={tone}
      showIcon
      icon={<ScanOutlined />}
      message="尚未执行配置"
      description={<>{reason}<br />完成后回到本服务的“本地运行”查看真实配置与验证结果。</>}
    />
    <section className="discovery-summary" aria-label="配置内容">
      <h3>智能体将完成</h3>
      <ul className="discovery-steps">
        <li>核对服务登记、真实代码和已有运行定义</li>
        <li>验证本地启动方式及实际需要的连接</li>
        <li>保存并读回配置，说明验证结果与剩余缺口</li>
      </ul>
    </section>
    <p className="discovery-impact"><strong>本次允许的影响</strong>本地候选启动、只读验证和该服务运行定义修改；不包括远程业务写入。已有实例不会因为保存新配置而自动重启。</p>
    {!prompt ? <Alert type="warning" showIcon message="当前工作空间路径或服务身份尚未读取，请关闭后重试。" /> : null}
    <details className="discovery-prompt">
      <summary>查看完整指令</summary>
      <div className="config-field">
        <Input.TextArea aria-label="运行配置指令" value={prompt} readOnly autoSize={{ minRows: 6, maxRows: 10 }} />
      </div>
    </details>
    <div className="discovery-note">复制指令不会执行配置；只有智能体实际验证并保存后，服务页才会显示新的配置事实。</div>
  </div>;
}
