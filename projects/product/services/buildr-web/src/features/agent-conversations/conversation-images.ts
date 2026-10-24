export const conversationImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const conversationImageLimit = 8 * 1024 * 1024;

export function transferredFiles(data: Pick<DataTransfer, 'files' | 'items'>): File[] {
  if (data.files.length) return Array.from(data.files);
  return Array.from(data.items).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
}

export function imageSelectionError(files: readonly File[], count: number, maxBytes = conversationImageLimit): string | undefined {
  if (count + files.length > 4) return '每次最多添加 4 张图片。';
  const unsupported = files.find(file => !conversationImageTypes.includes(file.type));
  if (unsupported) return `“${unsupported.name}”不是支持的图片。请选择 PNG、JPEG、WebP 或 GIF。`;
  const limit = Math.min(conversationImageLimit, maxBytes);
  const tooLarge = files.find(file => !file.size || file.size > limit);
  if (tooLarge) return `“${tooLarge.name}”为空或超过大小限制，每张最多 ${Math.floor(limit / 1024 / 1024)} MiB。`;
}
