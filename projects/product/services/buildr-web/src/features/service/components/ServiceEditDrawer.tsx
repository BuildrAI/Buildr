import { type ProjectResponse } from '../../project/api/project-api';
import { serviceApi } from '../api/service-api';
import { useEffect, useState, type FormEvent } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
import { Alert, Form, Input, Select } from 'antd';

import { SERVICE_TYPE_OPTIONS } from '../../../lib/labels';

type ServiceEditPayload = ProjectResponse & { revision: string; service: NonNullable<ProjectResponse['service']> };

export type ServiceEditSaved = {
  code: string;
  name: string;
  description: string;
  type: string;
  revision: string;
};

type Props = {
  open: boolean;
  projectCode: string | null;
  serviceCode: string | null;
  onClose: () => void;
  onSaved?: (service: ServiceEditSaved) => void;
};

export function ServiceEditDrawer({ open, projectCode, serviceCode, onClose, onSaved }: Props) {
  const { refreshNavigation } = useAppShell();
  const [current, setCurrent] = useState<ServiceEditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [editAlert, setEditAlert] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [serviceType, setServiceType] = useState('');

  useEffect(() => {
    if (!open || !projectCode || !serviceCode) {
      setCurrent(null);
      setLoadError('');
      setSaveError('');
      setEditAlert('');
      setServiceType('');
      setLoading(false);
      setSaving(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setSaveError('');
    void (async () => {
      try {
        const data = await serviceApi.service(projectCode, serviceCode) as ServiceEditPayload;
        if (cancelled) return;
        setCurrent(data);
        setName(data.service.name);
        setDescription(data.service.description || '');
        setServiceType(data.service.type);
        setEditAlert(data.migrationRequired ? (data.nextActions || []).join(' ') : '');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '无法读取服务');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, projectCode, serviceCode]);

  const typeOptions = SERVICE_TYPE_OPTIONS.some((option) => option.value === serviceType)
    ? [...SERVICE_TYPE_OPTIONS]
    : serviceType
      ? [...SERVICE_TYPE_OPTIONS, { value: serviceType, label: serviceType }]
      : [...SERVICE_TYPE_OPTIONS];

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current || !projectCode || !serviceCode || !serviceType || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await serviceApi.updateService(projectCode, serviceCode, {
        revision: current.revision,
        name,
        description,
        type: serviceType,
      }) as ServiceEditPayload;
      setCurrent(updated);
      setEditAlert(updated.migrationRequired ? (updated.nextActions || []).join(' ') : '');
      refreshNavigation();
      onSaved?.({
        code: updated.service.code,
        name: updated.service.name,
        description: updated.service.description || '',
        type: updated.service.type,
        revision: updated.revision,
      });
      onClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setSaveError(code === 'service_revision_conflict' ? '内容已被修改。当前输入已保留，请重新打开后核对。' : (err instanceof Error ? err.message : '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const readOnly = Boolean(current?.migrationRequired);

  return (
    <MetadataEditDrawer
      title="编辑服务" objectName={current?.service.name || serviceCode || ''}
      open={open} onClose={onClose} saving={saving} dirty={Boolean(current && (name !== current.service.name || description !== (current.service.description || '') || serviceType !== current.service.type))}
      disabled={readOnly || loading || !current || Boolean(loadError)}
      formId="service-edit-form" saveButtonId="service-save-button"
    >
      {loading ? (
        <p className="page-copy">正在读取…</p>
      ) : loadError ? (
        <Alert type="error" showIcon message={loadError} />
      ) : current ? (
        <>
          <p className="page-copy">修改服务名称、说明与类型。代码位置和来源不会改变。</p>
          <div id="service-edit-alert" className={editAlert || saveError ? '' : 'hidden'} role="status">
            {editAlert ? <Alert type="warning" showIcon message={editAlert} style={{ marginBottom: 16 }} /> : null}
            {saveError ? <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} /> : null}
          </div>
          <form
            id="service-edit-form"
            key={current.revision}
            onSubmit={(event) => void onSubmit(event)}
          >
            <Form layout="vertical" component={false}>
              <Form.Item label="名称" required>
                <Input
                  id="service-name"
                  name="name"
                  autoComplete="off"
                  required
                  disabled={readOnly || saving}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Form.Item>
              <Form.Item label="说明" required>
                <Input.TextArea
                  id="service-description"
                  name="description"
                  rows={6}
                  required
                  disabled={readOnly || saving}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Form.Item>
              <Form.Item label="类型" required>
                <Select
                  id="service-type"
                  style={{ width: '100%' }}
                  disabled={readOnly || saving}
                  value={serviceType || undefined}
                  onChange={setServiceType}
                  options={typeOptions}
                  placeholder="选择服务类型"
                  getPopupContainer={(node) => node.parentElement || document.body}
                />
              </Form.Item>

            </Form>
          </form>
        </>
      ) : null}
    </MetadataEditDrawer>
  );
}
