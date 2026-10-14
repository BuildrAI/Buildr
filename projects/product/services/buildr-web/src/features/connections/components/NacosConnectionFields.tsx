import { Alert, Checkbox, Collapse, Input, Select } from 'antd';
import type { NacosConnectionDraft } from '../nacos-connection-form';

type Props = {
  draft: NacosConnectionDraft;
  disabled: boolean;
  onChange<K extends keyof NacosConnectionDraft>(field: K, value: NacosConnectionDraft[K]): void;
};

export function NacosConnectionFields({ draft, disabled, onChange }: Props) {
  return <>
    <div className="buildr-nacos-production">
      <Checkbox id="nacos-connection-production" checked={draft.production} disabled={disabled} onChange={event => onChange('production', event.target.checked)}>生产连接</Checkbox>
      <p className="buildr-connections-muted">生产连接每次发布配置都需要你的授权。若属于测试环境，请取消勾选。</p>
    </div>
    {draft.production && <Alert type="info" showIcon message="每次生产发布前，智能体（Agent）会展示具体目标和内容差异，再取得你的授权。" />}
    <Collapse className="buildr-nacos-settings" ghost items={[{ key: 'scope', label: '可选设置', children: <div className="buildr-nacos-settings-fields">
      <label>命名空间（Namespace）编号<Input aria-label="Nacos 命名空间编号" value={draft.namespaceId} disabled={disabled} onChange={event => onChange('namespaceId', event.target.value)} placeholder="public" /></label>
      <label>默认分组（Group）<Input aria-label="Nacos 默认分组" value={draft.defaultGroup} disabled={disabled} onChange={event => onChange('defaultGroup', event.target.value)} placeholder="DEFAULT_GROUP" /></label>
      <label>接口版本（API Version）<Select aria-label="Nacos 接口版本" value={draft.apiVersion} disabled={disabled} onChange={value => onChange('apiVersion', value)} options={[{ value: 'auto', label: '自动识别' }, { value: 'v1', label: 'v1' }, { value: 'v2', label: 'v2' }, { value: 'v3', label: 'v3' }]} /></label>
      <p className="buildr-connections-muted">默认使用 public 和 DEFAULT_GROUP。其他命名空间（Namespace）请填写真实编号。</p>
    </div> }]} />
  </>;
}
