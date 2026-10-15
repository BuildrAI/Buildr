import { connectionFailure, inputObject } from './errors.mjs';
export const NACOS_CONTENT_BYTES = 4 * 1024 * 1024;
export const NACOS_CAS_LIMIT = '原生比较并交换（CAS）保护内容版本；Nacos 新增或更新语义（Upsert）可能在并发删除后重建配置，不能保证删除竞态保护。';
export const NACOS_RECHECK_LIMIT = '本次使用普通发布，写入前已再次读取管理详情并核对内容版本及类型；读取与写入并非原子操作，仍可能覆盖其间其他入口的修改，或在并发删除后重建配置。';
export function nacosIdentifier(value, label, max = 255, empty = false) {
    if (typeof value !== 'string' || value.length > max || !value.isWellFormed() || /[\u0000-\u001f\u007f]/u.test(value) || value !== value.trim() || !empty && !value) throw connectionFailure('nacos_input_invalid', `${label}无效。`);
    return value;
}
export function nacosNamespaceId(value) {
    return value === '' ? 'public' : nacosIdentifier(value, '命名空间编号', 255);
}
export function nacosApiBase(consoleUrl) {
    const url = new URL(consoleUrl);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/u, '') || '/nacos';
    return url.href.replace(/\/$/u, '');
}
export function nacosConfiguration(value, previous) {
    const input = inputObject(value, [
        'consoleUrl',
        'username',
        'namespaceId',
        'defaultGroup',
        'production',
        'apiVersion'
    ]);
    const current = {
        namespaceId: 'public',
        defaultGroup: 'DEFAULT_GROUP',
        production: true,
        apiVersion: 'auto',
        ...previous,
        ...input
    };
    const consoleUrl = nacosIdentifier(current.consoleUrl, 'Nacos 网站地址', 2048);
    let url;
    try {
        url = new URL(consoleUrl);
    } catch  {
        throw connectionFailure('nacos_url_invalid', '请填写完整 HTTP/HTTPS Nacos 网站地址。');
    }
    if (![
        'http:',
        'https:'
    ].includes(url.protocol) || !url.hostname || url.username || url.password || url.search) throw connectionFailure('nacos_url_invalid', 'Nacos 网站地址只接受 HTTP/HTTPS，不能内嵌账号、密码或查询参数。');
    if (typeof current.production !== 'boolean') throw connectionFailure('nacos_input_invalid', '请明确选择是否为生产连接。');
    if (![
        'auto',
        'v1',
        'v2',
        'v3'
    ].includes(String(current.apiVersion))) throw connectionFailure('nacos_input_invalid', 'Nacos 接口版本必须为 auto、v1、v2 或 v3。');
    return {
        consoleUrl: url.href,
        username: nacosIdentifier(current.username, '用户名', 128),
        namespaceId: nacosNamespaceId(current.namespaceId),
        defaultGroup: nacosIdentifier(current.defaultGroup, '默认分组', 128),
        production: current.production,
        apiVersion: current.apiVersion
    };
}
export function nacosContent(value) {
    if (typeof value !== 'string' || !value.isWellFormed() || value.includes('\0') || Buffer.byteLength(value, 'utf8') > NACOS_CONTENT_BYTES) throw connectionFailure('nacos_content_invalid', '配置内容必须为不超过 4 MiB 的完整 UTF-8 文本。');
    return value;
}
export function nacosMd5(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{32}$/iu.test(value)) throw connectionFailure('nacos_md5_required', '请提交读取该配置时获得的完整 MD5 摘要。', 409);
    return value.toLowerCase();
}
export function nacosPage(value, fallback, max) {
    const result = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(result) || Number(result) < 1 || Number(result) > max) throw connectionFailure('nacos_input_invalid', '配置列表页码或页大小无效。');
    return Number(result);
}
