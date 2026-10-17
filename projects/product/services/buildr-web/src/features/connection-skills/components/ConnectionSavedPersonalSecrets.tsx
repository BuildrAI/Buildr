import { useContext, useEffect, useRef, useState } from 'react';
import { Input, Spin } from 'antd';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import type { ConnectionSkillsClient } from '../api/connection-skills-api';
import type { ConnectionField, ConnectionInstance } from '../connection-skill-types';
import { createDraftRequestScope, draftObservations } from '../connection-skill-form';

type Props = { fields: ConnectionField[]; instance: ConnectionInstance; client: ConnectionSkillsClient; disabled: boolean; onConflict(cause: unknown): void };

function SavedSecretField({ field, instance, client, disabled, onConflict }: Omit<Props, 'fields'> & { field: ConnectionField }) {
  const active = useContext(WorkspaceViewActiveContext);
  const [revealed, setRevealed] = useState<{ identity: string; value: string }>(), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const requests = useRef(createDraftRequestScope()).current;
  const identity = JSON.stringify([instance.id, instance.teamRevision, instance.localRevision, instance.definitionRevision, field.key]);
  const current = useRef({ identity, available: active && !disabled }); current.current = { identity, available: active && !disabled };
  const value = current.current.available && revealed?.identity === identity ? revealed.value : undefined;
  useEffect(() => {
    setRevealed(undefined); setLoading(false); setError(''); requests.invalidate();
    return () => requests.invalidate();
  }, [requests, identity, active, disabled]);
  async function toggle(visible: boolean) {
    if (!visible) { requests.invalidate(); setRevealed(undefined); setLoading(false); setError(''); return; }
    const request = requests.begin(); setLoading(true); setError('');
    const isCurrent = () => request.isCurrent() && current.current.available && current.current.identity === identity;
    try {
      const result = await client.revealPersonal(instance.id, { field: field.key, expected: draftObservations(instance).personal }, request.signal);
      if (!isCurrent()) return;
      if (result.field !== field.key || typeof result.value !== 'string') throw new Error('无法查看已保存内容，请重新读取连接后重试。');
      setRevealed({ identity, value: result.value });
    } catch (cause) { if (isCurrent()) { setRevealed(undefined); setError((cause as Error).message); if ((cause as { status?: number }).status === 409) onConflict(cause); } }
    finally { if (isCurrent()) setLoading(false); }
  }
  if (!active) return null;
  const id = `connection-skill-saved-personal-${field.key}`;
  const toggleLabel = `${value === undefined ? '查看' : '隐藏'}已保存的${field.label}`, ToggleIcon = value === undefined ? EyeInvisibleOutlined : EyeOutlined;
  return <div className="buildr-connection-skill-field"><label htmlFor={id}>已保存的{field.label}</label><Input.Password id={id} aria-label={`已保存的${field.label}`} readOnly autoComplete="off" disabled={disabled || loading} value={value ?? '••••••••'} visibilityToggle={{ visible: value !== undefined, onVisibleChange: visible => void toggle(visible) }} iconRender={() => <ToggleIcon title={toggleLabel} aria-label={toggleLabel} role="button" tabIndex={disabled || loading ? -1 : 0} onKeyDown={event => { if (!disabled && !loading && ['Enter', ' '].includes(event.key)) { event.preventDefault(); void toggle(value === undefined); } }} />} />{loading && <small><Spin size="small" /> 正在读取本机保存内容</small>}{error && <small role="alert">{error}</small>}</div>;
}

/** Revealed values live only in these mounted inputs, never in the editable authentication draft. */
export function ConnectionSavedPersonalSecrets({ fields, instance, client, disabled, onConflict }: Props) {
  if (!instance.authentication.personal.configured) return null;
  return <div className="buildr-connection-saved-personal-secrets">{fields.filter(field => field.type === 'secret').map(field => <SavedSecretField key={field.key} field={field} instance={instance} client={client} disabled={disabled} onConflict={onConflict} />)}</div>;
}
