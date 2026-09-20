import { useState } from 'react';
import { Alert, Modal } from 'antd';
import { publicationApi, type Publication } from '../api/publication-api';
export function ArticleDeleteModal({ article, onClose, onDeleted }: { article: Publication; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Modal open title="删除这篇文章？" okText="删除文章" cancelText="取消" okButtonProps={{ danger: true }} confirmLoading={busy} onCancel={() => !busy && onClose()} onOk={() => {
    setBusy(true); setError('');
    void publicationApi.remove(article.projectCode, article.id, article.revision).then(onDeleted).catch(err => setError(err instanceof Error ? err.message : '删除失败')).finally(() => setBusy(false));
  }}><strong>{article.title}</strong><p className="publication-hint">将移除当前项目中的稿件，保留图片附件及已经发布到外部平台的内容。</p>{error && <Alert type="error" message={error} description="稿件可能已经变化。请返回文章刷新并核对后，再决定是否删除。" />}</Modal>;
}
