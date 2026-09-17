import { useRef } from 'react';
import { repositoryCodeFromUrl } from './repository-defaults';
import { Form, Input } from 'antd';
import type { RepositoryDraft } from '../api/asset-catalog-api';
export function RepositoryFields({ value, onChange, editing = false }: { value: RepositoryDraft; onChange: (value: RepositoryDraft) => void; editing?: boolean }) {
  const manualCode = useRef(Boolean(value.code)), manualPath = useRef(Boolean(value.path));
  const update = (key: keyof RepositoryDraft, text: string) => {
    if (key === 'code') manualCode.current = true;
    if (key === 'path') manualPath.current = true;
    const next = { ...value, [key]: text };
    if (key === 'url' && !editing) {
      const code = repositoryCodeFromUrl(text);
      if (!manualCode.current) next.code = code;
      if (!manualPath.current) next.path = code ? `repositories/${code}` : '';
    }
    onChange(next);
  };
  const addressField = <Form.Item label="Git 地址" required={!value.path}><Input aria-label="Git 地址" required={!value.path} value={value.url || ''} onChange={e => update('url', e.target.value)} placeholder="已有本地仓库可留空" /></Form.Item>;
  return <>
    {!editing && addressField}
    {!editing && <Form.Item label="代码库标识" required help="根据 Git 地址自动填写，可手动修改"><Input aria-label="代码库标识" required value={value.code} onChange={e => update('code', e.target.value)} /></Form.Item>}
    <Form.Item label="仓库目录" required={editing}><Input required={editing} aria-label="仓库目录" value={value.path || ''} onChange={e => update('path', e.target.value)} placeholder={`默认 repositories/${value.code || '<标识>'}`} /></Form.Item>
    <p className="page-copy">填写 . 引用工作空间根仓库；也可填写内部相对目录或外部绝对路径。已有目录必须是 Git 仓库根目录。</p>

    {editing && addressField}
    <Form.Item label="远端名称（Remote）" help={!value.url ? '填写 Git 地址后配置远端名称' : undefined}><Input disabled={!value.url} aria-label="远端名称" value={value.remote || ''} placeholder="origin" onChange={e => update('remote', e.target.value)} /></Form.Item>
    <Form.Item label="集成分支" required={Boolean(value.url)}><Input aria-label="集成分支" required={Boolean(value.url)} value={value.integrationBranch || ''} onChange={e => update('integrationBranch', e.target.value)} placeholder="例如 dev；不会切换当前分支" /></Form.Item>
  </>;
}
