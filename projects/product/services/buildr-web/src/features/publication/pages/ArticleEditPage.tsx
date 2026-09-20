import { ArticleDetailPage } from './ArticleDetailPage';

/** 兼容旧编辑地址，继续使用同一阅读现场与编辑抽屉。 */
export function ArticleEditPage() {
  return <ArticleDetailPage initialEditing />;
}
