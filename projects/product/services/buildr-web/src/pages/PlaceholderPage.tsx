import { useEffect } from 'react';
import { useAppShell } from '../app/AppShellContext';

type Props = {
  title: string;
  navLabel?: string;
};

export function PlaceholderPage({ title, navLabel }: Props) {
  const { setBreadcrumbParts, workspace } = useAppShell();

  useEffect(() => {
    setBreadcrumbParts([workspace?.name || '工作空间', navLabel || title]);
  }, [setBreadcrumbParts, workspace?.name, title, navLabel]);

  return (
    <section className="page-header">
      <p className="eyebrow">尚未迁移</p>
      <h1>{title}</h1>
      <p className="page-copy">该页面仍在 React 迁移队列中；导航已保留，内容将在后续切片补齐。</p>
    </section>
  );
}
