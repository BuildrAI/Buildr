import { Alert, Button, Spin } from 'antd';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';

/** Legacy project/service addresses resolve against registered associations before opening a preview. */
export function ServiceDetailPage() {
  const { projectCode = '', serviceCode = '' } = useParams();
  const { workspaceId } = useAppShell();
  const location = useLocation();
  const catalog = useAssetCatalog();
  const project = catalog.data?.projects.find(item => item.code === projectCode);
  const services = catalog.data?.services.filter(item => project?.serviceIds?.includes(item.id) && (item.code === serviceCode || item.id === serviceCode)) || [];
  if (!catalog.data && catalog.loading) return <Spin />;
  if (catalog.error || services.length !== 1) return <section className="resource-home">
    <Alert type="error" message="服务地址暂不可用" description={catalog.error || '当前项目没有唯一匹配的服务登记，请从服务目录继续查看。'} action={<Button onClick={catalog.reload}>重试</Button>} />
    <Link to={workspaceHref(workspaceId, '/services')}>返回服务目录</Link>
  </section>;
  return <Navigate replace to={workspaceHref(workspaceId, `/services/${encodeURIComponent(services[0].id)}${location.state?.editResource ? '?edit=1' : ''}`)} />;
}
