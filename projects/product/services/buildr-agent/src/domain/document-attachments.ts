import { fail } from './agent-state.ts';

export const documentExtensions: Record<string, string> = {
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
export const documentTypes = [...new Set(Object.values(documentExtensions))];
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
export function attachmentName(name: string | undefined): string | undefined {
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\x00-\x1f\x7f/\\]/.test(name))) fail('agent_attachment_invalid', '附件名称无效。');
  return name;
}
/** Container signatures are a bounded sanity check, not document parsing or safety certification. */
export function documentBytes(input: { mimeType: string; bytes: Uint8Array; name?: string }): Buffer {
  attachmentName(input.name);
  if (!(input.bytes instanceof Uint8Array) || !documentTypes.includes(input.mimeType)) fail('agent_document_invalid', '文档类型不支持。');
  const bytes = Buffer.from(input.bytes);
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) fail('agent_document_invalid', '文档为空或超过32 MiB。', 413);
  const type = input.mimeType;
  const valid = type === 'application/pdf' ? bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))
    : ['application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint'].includes(type) ? bytes.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))
    : type.includes('openxmlformats') || type.includes('oasis.opendocument') ? bytes.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))
    : type === 'application/rtf' ? bytes.subarray(0,5).toString() === '{\\rtf'
    : bytes.subarray(0,2).equals(Buffer.from([0xff,0xfe])) || bytes.subarray(0,2).equals(Buffer.from([0xfe,0xff])) || !bytes.includes(0); // Text is not interpreted or executed, and need not be UTF-8.
  if (!valid) fail('agent_document_invalid', '文档内容与声明类型不符。');
  return bytes;
}
