export const conversationImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const conversationImageLimit = 8 * 1024 * 1024;
export const conversationVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
export const conversationVideoLimit = 32 * 1024 * 1024;
export const conversationDocumentExtensions: Record<string,string> = {
  "md": "text/markdown",
  "markdown": "text/markdown",
  "txt": "text/plain",
  "log": "text/plain",
  "csv": "text/csv",
  "tsv": "text/tab-separated-values",
  "json": "application/json",
  "xml": "application/xml",
  "yaml": "application/yaml",
  "yml": "application/yaml",
  "pdf": "application/pdf",
  "doc": "application/msword",
  "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "xls": "application/vnd.ms-excel",
  "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "ppt": "application/vnd.ms-powerpoint",
  "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "rtf": "application/rtf",
  "odt": "application/vnd.oasis.opendocument.text",
  "ods": "application/vnd.oasis.opendocument.spreadsheet",
  "odp": "application/vnd.oasis.opendocument.presentation"
};
export const conversationDocumentTypes = [...new Set(Object.values(conversationDocumentExtensions))];
export const conversationDocumentLimit = 32 * 1024 * 1024;
export const conversationAttachmentAccept = [...conversationImageTypes, ...conversationVideoTypes, ...conversationDocumentTypes, ...Object.keys(conversationDocumentExtensions).map(extension=>'.'+extension), '.mp4', '.webm', '.mov'].join(',');

export function attachmentMimeType(file: Pick<File, 'name' | 'type'>): string {
  const documentType = conversationDocumentExtensions[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
  if (documentType) return documentType;
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  return ({mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'} as Record<string,string>)[file.name.split('.').at(-1)?.toLowerCase() ?? ''] ?? file.type;
}

export function transferredFiles(data: Pick<DataTransfer, 'files' | 'items'>): File[] {
  if (data.files.length) return Array.from(data.files);
  return Array.from(data.items).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
}

export function imageSelectionError(files: readonly File[], count: number, maxBytes = conversationImageLimit): string | undefined {
  if (count + files.length > 9) return '每次最多添加 9 份附件。';
  const unsupported = files.find(file => ![...conversationImageTypes,...conversationVideoTypes,...conversationDocumentTypes].includes(attachmentMimeType(file)));
  if (unsupported) return `“${unsupported.name}”不是支持的附件。请选择图片、视频或 Markdown、PDF、Word、Excel、PowerPoint、文本等常见文档。`;
  for (const file of files) {
    const video = conversationVideoTypes.includes(attachmentMimeType(file));
    const document = conversationDocumentTypes.includes(attachmentMimeType(file));
    const limit = document ? conversationDocumentLimit : video ? conversationVideoLimit : Math.min(conversationImageLimit, maxBytes);
    if (!file.size || file.size > limit) return `“${file.name}”为空或超过大小限制，${document ? '每份文档' : video ? '每个视频' : '每张图片'}最多 ${Math.floor(limit / 1024 / 1024)} MiB。`;
  }
}
