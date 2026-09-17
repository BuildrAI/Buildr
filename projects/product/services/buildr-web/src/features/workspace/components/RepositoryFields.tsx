import { Form, Input } from 'antd';
import type { RepositoryDraft } from '../api/asset-catalog-api';
export function RepositoryFields({ value, onChange }: { value: RepositoryDraft; onChange: (value: RepositoryDraft) => void }) {
  const update = (key: keyof RepositoryDraft, text: string) => onChange({ ...value, [key]: text });
  return <>
    <Form.Item label="代码库标识" required><Input aria-label="代码库标识" required value={value.code} onChange={e => update('code', e.target.value)} /></Form.Item>
    <Form.Item label="仓库目录"><Input aria-label="仓库目录" value={value.path || ''} onChange={e => update('path', e.target.value)} placeholder={`默认 repositories/${value.code || '<标识>'}`} /></Form.Item>
    <p className="page-copy">填写 . 引用工作空间根仓库；也可填写内部相对目录或外部绝对路径。已有目录必须是 Git 仓库根目录。</p>
    <Form.Item label="Git 地址" required={!value.path}><Input aria-label="Git 地址" required={!value.path} value={value.url || ''} onChange={e => update('url', e.target.value)} placeholder="已有本地仓库可留空" /></Form.Item>
    <Form.Item label="集成分支" required={Boolean(value.url)}><Input aria-label="集成分支" required={Boolean(value.url)} value={value.integrationBranch || ''} onChange={e => update('integrationBranch', e.target.value)} /></Form.Item>
  </>;
}
