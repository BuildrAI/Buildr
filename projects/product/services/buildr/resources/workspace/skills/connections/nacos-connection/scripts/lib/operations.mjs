import crypto from 'node:crypto';
import { connectionFailure, inputObject, passwordInput } from './errors.mjs';
import { NACOS_CAS_LIMIT, NACOS_RECHECK_LIMIT, nacosApiBase, nacosConfiguration, nacosContent, nacosIdentifier, nacosMd5, nacosNamespaceId, nacosPage } from './configuration.mjs';
import { NacosHttpClient, nacosData, nacosJson } from './http.mjs';
function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw connectionFailure('nacos_response_invalid', 'Nacos 返回数据不完整或格式不受支持。', 502);
    return value;
}
function responseString(value, label) {
    if (typeof value !== 'string') throw connectionFailure('nacos_response_invalid', `Nacos 返回的${label}不完整。`, 502);
    return value;
}
function optionalString(value) {
    return value === undefined || value === null ? null : responseString(value, '配置元数据');
}
const metadataKeys = ['appName', 'desc', 'configTags', 'use', 'effect', 'schema'];
function metadata(value) {
    const result = {};
    for (const key of metadataKeys) if (value[key] !== undefined && value[key] !== null) result[key] = responseString(value[key], '配置元数据');
    return result;
}
function digest(content) {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}
function scope(config, version) {
    return version === 'v1' && config.namespaceId === 'public' ? '' : config.namespaceId;
}
function identity(config, input) {
    return {
        dataId: nacosIdentifier(input.dataId, '配置标识', 255),
        group: input.group === undefined ? config.defaultGroup : nacosIdentifier(input.group, '分组', 128)
    };
}
function candidates(config) {
    return config.apiVersion === 'auto' ? [
        'v3',
        'v2',
        'v1'
    ] : [
        config.apiVersion
    ];
}
async function negotiate(client, run, missingCode = 'nacos_api_unsupported') {
    for (const version of candidates(client.config)){
        try {
            return await run(version);
        } catch (error) {
            if (error.code !== 'nacos_route_missing') throw error;
        }
    }
    throw connectionFailure(missingCode, missingCode === 'nacos_config_missing' ? '指定 Nacos 配置不存在或没有受支持的读取接口。' : '该地址未提供本次操作所需的 Nacos 接口，请核对版本。', missingCode === 'nacos_config_missing' ? 404 : 502);
}
async function namespaces(client) {
    return negotiate(client, async (version)=>{
        const route = version === 'v3' ? '/v3/admin/core/namespace/list' : version === 'v2' ? '/v2/console/namespace/list' : '/v1/console/namespaces';
        const data = nacosData(nacosJson((await client.request(route)).text), version === 'v1');
        if (!Array.isArray(data)) throw connectionFailure('nacos_response_invalid', 'Nacos 命名空间列表格式不受支持。', 502);
        return data.map((item)=>{
            const current = object(item), namespaceId = nacosNamespaceId(responseString(current.namespace ?? current.namespaceId, '命名空间编号'));
            const result = {
                namespaceId,
                namespaceName: responseString(current.namespaceShowName ?? current.namespaceName, '命名空间名称')
            };
            if (typeof current.configCount === 'number' && Number.isSafeInteger(current.configCount) && current.configCount >= 0) result.configCount = current.configCount;
            return result;
        });
    });
}
async function configs(client, input) {
    inputObject(input, [
        'dataId',
        'group',
        'pageNo',
        'pageSize'
    ]);
    const pageNo = nacosPage(input.pageNo, 1, 1_000_000), pageSize = nacosPage(input.pageSize, 20, 100);
    const dataId = input.dataId === undefined ? '' : nacosIdentifier(input.dataId, '配置搜索', 255, true), group = input.group === undefined ? client.config.defaultGroup : nacosIdentifier(input.group, '分组搜索', 128, true);
    return negotiate(client, async (version)=>{
        const route = version === 'v3' ? '/v3/admin/cs/config/list' : version === 'v2' ? '/v2/cs/config/searchDetail' : '/v1/cs/configs';
        const query = {
            dataId,
            search: 'blur',
            pageNo: String(pageNo),
            pageSize: String(pageSize)
        };
        query[version === 'v3' ? 'groupName' : 'group'] = group;
        query[version === 'v3' ? 'namespaceId' : 'tenant'] = scope(client.config, version === 'v2' ? 'v1' : version);
        if (version === 'v2') query.config_detail = '';
        const parsed = nacosJson((await client.request(route, {
            query
        })).text);
        const data = object(version === 'v3' ? nacosData(parsed) : parsed);
        if (!Array.isArray(data.pageItems) || data.pageItems.length > pageSize || !Number.isSafeInteger(data.totalCount) || Number(data.totalCount) < 0 || !Number.isSafeInteger(data.pagesAvailable) || Number(data.pagesAvailable) < 0 || data.pageNumber !== pageNo) throw connectionFailure('nacos_response_invalid', 'Nacos 分页结果不完整，未将当前页当作全量。', 502);
        const items = data.pageItems.map((value)=>{
            const item = object(value);
            const returnedNamespace = item.tenant ?? item.namespaceId;
            if (returnedNamespace !== undefined && nacosNamespaceId(returnedNamespace) !== client.config.namespaceId) throw connectionFailure('nacos_scope_mismatch', 'Nacos 返回了其他命名空间的配置，已拒绝该结果。', 502);
            return {
                dataId: responseString(item.dataId, '配置标识'),
                group: responseString(item.groupName ?? item.group, '分组'),
                type: optionalString(item.type),
                md5: optionalString(item.md5)
            };
        });
        return {
            namespaceId: client.config.namespaceId,
            apiVersion: version,
            pageNo,
            pageSize,
            totalCount: Number(data.totalCount),
            pagesAvailable: Number(data.pagesAvailable),
            items
        };
    });
}
async function get(client, input, fixedVersion) {
    inputObject(input, [
        'dataId',
        'group'
    ]);
    const target = identity(client.config, input);
    const read = async (version)=>{
        const route = version === 'v3' ? '/v3/admin/cs/config' : version === 'v2' ? '/v2/cs/config' : '/v1/cs/configs';
        const query = {
            dataId: target.dataId,
            [version === 'v3' ? 'groupName' : 'group']: target.group,
            [version === 'v1' ? 'tenant' : 'namespaceId']: scope(client.config, version)
        };
        const response = await client.request(route, {
            query
        });
        let content, type, md5, observedMetadata;
        if (version === 'v3') {
            const data = object(nacosData(nacosJson(response.text)));
            if (data.dataId !== target.dataId || (data.groupName ?? data.group) !== target.group || data.namespaceId !== undefined && nacosNamespaceId(data.namespaceId) !== client.config.namespaceId) throw connectionFailure('nacos_scope_mismatch', 'Nacos 返回的配置身份与请求不一致，已拒绝该结果。', 502);
            content = responseString(data.content, '配置内容');
            type = optionalString(data.type);
            md5 = optionalString(data.md5);
            observedMetadata = metadata(data);
        } else {
            content = version === 'v1' ? response.text : responseString(nacosData(nacosJson(response.text)), '配置内容');
            type = response.headers.get('Config-Type');
            md5 = response.headers.get('Content-MD5');
        }
        const detail = {
            namespaceId: client.config.namespaceId,
            apiVersion: version,
            ...target,
            content: nacosContent(content),
            type,
            md5: md5 ? nacosMd5(md5) : digest(content),
            ...observedMetadata ? {
                metadata: observedMetadata
            } : {}
        };
        if (version !== 'v3' && type === null) {
            try {
                return await publicationDetail(client, target, version);
            } catch  {}
        }
        return detail;
    };
    return fixedVersion ? read(fixedVersion) : negotiate(client, read, 'nacos_config_missing');
}
function supportedCas(version, apiVersion) {
    const parsed = version?.match(/^(2|3)\.(\d+)\.(\d+)$/u);
    return !!parsed && (parsed[1] === '3' ? apiVersion === 'v3' : (Number(parsed[2]) >= 4 || Number(parsed[2]) === 3 && Number(parsed[3]) >= 2) && apiVersion !== 'v3');
}
async function publicationDetail(client, target, version) {
    let detail;
    try {
        const value = nacosJson((await client.request('/v1/cs/configs', {
            query: {
                ...target,
                tenant: scope(client.config, 'v1'),
                show: 'all'
            }
        })).text);
        if (value === null) throw connectionFailure('nacos_config_missing', '指定 Nacos 配置不存在，未发布。', 404);
        detail = object(value);
        // ConfigAllInfo is a different wire model from v3 ConfigDetailInfo. Its
        // optional nulls may be omitted by Nacos NON_NULL serialization, but the
        // full management route must still prove its required identity/schema.
        if (version === 'v3' && (!Object.hasOwn(detail, 'tenant') || typeof detail.tenant !== 'string' || !Object.hasOwn(detail, 'group') || typeof detail.content !== 'string' || typeof detail.md5 !== 'string' || !['createTime', 'modifyTime'].every(key => Number.isSafeInteger(detail[key]) && detail[key] >= 0))) throw connectionFailure('nacos_metadata_unavailable', '管理详情不是完整 ConfigAllInfo 响应，未猜测缺少的元数据或发布；第三版接口读取仍可用。', 409);
    } catch (error) {
        if ([
            'nacos_config_missing',
            'nacos_access_denied',
            'nacos_config_conflict'
        ].includes(error.code || '')) throw error;
        throw connectionFailure('nacos_metadata_unavailable', '无法读取保留现有类型及元数据所需的配置详情，未发布；配置读取仍可用。', 409);
    }
    if (detail.dataId !== target.dataId || detail.group !== target.group || detail.tenant !== undefined && nacosNamespaceId(detail.tenant) !== client.config.namespaceId) throw connectionFailure('nacos_scope_mismatch', 'Nacos 配置详情的身份与请求不一致，未发布。', 502);
    const content = nacosContent(responseString(detail.content, '配置内容'));
    return {
        namespaceId: client.config.namespaceId,
        apiVersion: version,
        ...target,
        content,
        md5: typeof detail.md5 === 'string' ? nacosMd5(detail.md5) : digest(content),
        type: optionalString(detail.type),
        metadata: metadata(detail)
    };
}
function checkPublicationObservation(detail, previous, expectedMd5, requestedType) {
    if (detail.md5 !== expectedMd5 || detail.content !== previous.content) throw connectionFailure('nacos_config_conflict', '写入前读取的配置内容已变化，请重新读取并判断；未发布。', 409);
    if (requestedType !== undefined && requestedType !== detail.type || previous.type !== null && previous.type !== detail.type) throw connectionFailure('nacos_config_conflict', '写入前读取的配置类型已变化，请重新读取并判断；未覆盖当前类型。', 409);
}
async function publish(client, input) {
    inputObject(input, [
        'dataId',
        'group',
        'content',
        'expectedMd5',
        'type',
        'beforeWrite'
    ]);
    const target = identity(client.config, input), content = nacosContent(input.content), expectedMd5 = nacosMd5(input.expectedMd5);
    const requestedType = input.type === undefined ? undefined : nacosIdentifier(input.type, '配置类型', 64);
    const observed = await get(client, target);
    const baseline = await publicationDetail(client, target, observed.apiVersion);
    checkPublicationObservation(baseline, observed, expectedMd5, requestedType);
    const serverVersion = await client.serverVersion();
    const nativeCas = supportedCas(serverVersion, baseline.apiVersion);
    const current = await publicationDetail(client, target, baseline.apiVersion);
    checkPublicationObservation(current, baseline, expectedMd5, requestedType);
    if (current.type === null && requestedType === undefined) throw connectionFailure('nacos_metadata_unavailable', '当前配置类型未能确认，未猜测默认类型或发布；配置读取仍可用。', 409);
    const publicationType = requestedType ?? current.type;
    if (![
        'properties',
        'xml',
        'json',
        'text',
        'html',
        'yaml',
        'toml'
    ].includes(publicationType || '')) throw connectionFailure('nacos_type_unsupported', '该配置类型不在已确认的发布范围，未猜测或改成默认文本类型；配置读取仍可用。', 409);
    const version = current.apiVersion;
    const route = version === 'v3' ? '/v3/admin/cs/config' : version === 'v2' ? '/v2/cs/config' : '/v1/cs/configs';
    const form = {
        dataId: target.dataId,
        [version === 'v3' ? 'groupName' : 'group']: target.group,
        [version === 'v1' ? 'tenant' : 'namespaceId']: scope(client.config, version),
        content
    };
    form.type = publicationType;
    for (const [key, value] of Object.entries(current.metadata || {}))form[version === 'v1' && key === 'configTags' ? 'config_tags' : key] = value;
    if (input.beforeWrite !== undefined) {
        if (typeof input.beforeWrite !== 'function') throw connectionFailure('nacos_input_invalid', '写入前检查无效。');
        await input.beforeWrite(current);
    }
    try {
        const response = await client.request(route, {
            method: 'POST',
            form,
            ...nativeCas ? {
                casMd5: expectedMd5
            } : {}
        });
        const accepted = version === 'v1' ? response.text.trim() === 'true' : nacosData(nacosJson(response.text)) === true;
        if (!accepted) throw connectionFailure('nacos_publish_outcome_unknown', 'Nacos 未返回明确的发布成功结果；请重新读取实际配置，不要盲目重试。', 502);
    } catch (error) {
        if ([
            'nacos_config_conflict',
            'nacos_access_denied'
        ].includes(error.code || '')) throw error;
        throw connectionFailure('nacos_publish_outcome_unknown', '无法确认本次发布结果；请求未自动重发，请重新读取实际配置后判断。', 502);
    }
    const result = {
        published: true,
        verified: false,
        namespaceId: client.config.namespaceId,
        apiVersion: version,
        ...target,
        expectedMd5,
        md5: null,
        concurrencyProtection: nativeCas ? 'native-cas' : 'preflight-recheck',
        ...nativeCas ? {
            upstreamCasLimit: NACOS_CAS_LIMIT
        } : {
            concurrencyWarning: NACOS_RECHECK_LIMIT
        }
    };
    try {
        const observed = await publicationDetail(client, target, version);
        result.md5 = observed.md5;
        result.contentVerified = observed.content === content;
        result.typeVerified = observed.type === publicationType;
        result.metadataVerified = metadataKeys.every(key => (observed.metadata?.[key] ?? null) === (current.metadata?.[key] ?? null));
        result.verified = result.contentVerified && result.typeVerified && result.metadataVerified;
        if (!result.verified) result.verificationError = {
            code: 'nacos_verification_mismatch',
            message: 'Nacos 已接受发布，但回读正文、格式或应保留元数据与候选不同，请重新观察；未自动覆盖或重发。'
        };
    } catch (error) {
        result.verificationError = {
            code: error.code || 'nacos_verification_failed',
            message: 'Nacos 已接受发布，但后续读取未完成；请重新读取实际配置，勿把本次操作视为未执行。'
        };
    }
    return result;
}
export function createNacosProvider(options = {}) {
    const client = (config, credentials)=>{
        if (!Object.hasOwn(credentials, 'password')) throw connectionFailure('connection_credentials_missing', '该 Nacos 连接尚未在本机配置认证信息。', 409);
        return new NacosHttpClient(nacosConfiguration(config), passwordInput(credentials.password), options);
    };
    return {
        category: 'configuration',
        type: 'nacos',
        validateConfig: (value, previous)=>nacosConfiguration(value, previous),
        validateCredentials: (value)=>{
            const input = inputObject(value, [
                'password'
            ]);
            return {
                password: passwordInput(input.password)
            };
        },
        authenticationTargetIdentity: (config)=>{
            const current = nacosConfiguration(config);
            return JSON.stringify([
                nacosApiBase(current.apiBaseUrl),
                current.username
            ]);
        },
        async test (config, credentials) {
            const startedAt = Date.now(), current = client(config, credentials), listed = await namespaces(current);
            if (!listed.some((item)=>item.namespaceId === current.config.namespaceId)) throw connectionFailure('nacos_namespace_missing', '指定命名空间不存在或当前账号不可见。', 404);
            const page = await configs(current, {
                pageSize: 1
            });
            return {
                ok: true,
                apiVersion: page.apiVersion,
                namespaceId: current.config.namespaceId,
                serverVersion: await current.serverVersion(),
                elapsedMs: Date.now() - startedAt
            };
        },
        nacos: {
            namespaces: (config, credentials)=>namespaces(client(config, credentials)),
            configs: (config, credentials, input)=>configs(client(config, credentials), input),
            get: (config, credentials, input)=>get(client(config, credentials), input),
            publish: (config, credentials, input)=>publish(client(config, credentials), input)
        }
    };
}
