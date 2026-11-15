export type MarkdownImageTarget = {
  /** 已解析的图片地址；预览必须复用它，不能改用页面缩略画面。 */
  src: string;
  alt: string;
  /** 作者书写的原始引用，用于预览显示来源。 */
  reference: string;
};

/**
 * 为已解析的 Markdown 图片附加放大预览操作。
 *
 * 只有宿主传入回调时才改变输出；其他 Markdown 阅读面保持不可交互。
 * 回调在触发时读取，宿主重渲染后仍使用最新处理函数。
 */
export function bindMarkdownImagePreviews(
  root: Pick<ParentNode, 'querySelectorAll'>,
  currentHandler: () => ((image: MarkdownImageTarget) => void) | undefined,
) {
  for (const image of root.querySelectorAll('img')) {
    const open = (event: Event) => {
      // 图片位于链接内时预览优先，避免一次点击同时打开预览和导航。
      event.preventDefault();
      event.stopPropagation();
      currentHandler()?.({
        src: image.getAttribute('src') || '',
        alt: image.getAttribute('alt') || '',
        reference: image.getAttribute('data-markdown-href') || image.getAttribute('src') || '',
      });
    };
    image.classList.add('markdown-zoomable-image');
    image.setAttribute('role', 'button');
    image.setAttribute('tabindex', '0');
    image.setAttribute('title', '点击查看大图');
    image.setAttribute('aria-label', `查看大图：${image.getAttribute('alt') || '图片'}`);
    image.addEventListener('click', open);
    image.addEventListener('keydown', event => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') open(event);
    });
  }
}
