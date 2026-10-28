export const conversationImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const conversationImageLimit = 8 * 1024 * 1024;
export const conversationVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
export const conversationVideoLimit = 32 * 1024 * 1024;
export const conversationAttachmentAccept = [...conversationImageTypes, ...conversationVideoTypes, '.mp4', '.webm', '.mov'].join(',');

export function attachmentMimeType(file: Pick<File, 'name' | 'type'>): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  return ({mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'} as Record<string,string>)[file.name.split('.').at(-1)?.toLowerCase() ?? ''] ?? file.type;
}

export function transferredFiles(data: Pick<DataTransfer, 'files' | 'items'>): File[] {
  if (data.files.length) return Array.from(data.files);
  return Array.from(data.items).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
}

export function imageSelectionError(files: readonly File[], count: number, maxBytes = conversationImageLimit): string | undefined {
  if (count + files.length > 4) return '每次最多添加 4 份图片或视频。';
  const unsupported = files.find(file => ![...conversationImageTypes,...conversationVideoTypes].includes(attachmentMimeType(file)));
  if (unsupported) return `“${unsupported.name}”不是支持的附件。请选择 PNG、JPEG、WebP、GIF 图片或 MP4、WebM、MOV 视频。`;
  for (const file of files) {
    const video = conversationVideoTypes.includes(attachmentMimeType(file));
    const limit = video ? conversationVideoLimit : Math.min(conversationImageLimit, maxBytes);
    if (!file.size || file.size > limit) return `“${file.name}”为空或超过大小限制，${video ? '每个视频' : '每张图片'}最多 ${Math.floor(limit / 1024 / 1024)} MiB。`;
  }
}
