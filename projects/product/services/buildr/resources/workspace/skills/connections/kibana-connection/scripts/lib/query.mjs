import { connectionFailure, inputObject } from './errors.mjs';
import { kibanaInteger, kibanaText, kibanaTimeRange } from './configuration.mjs';
const commonKeys = [
    'dataViewId',
    'since',
    'from',
    'to',
    'service',
    'namespace',
    'contains',
    'traceId',
    'filters'
];
const numericTypes = new Set([
    'byte',
    'short',
    'integer',
    'long',
    'unsigned_long',
    'half_float',
    'float',
    'double',
    'scaled_float'
]);
const stringTypes = new Set([
    'keyword',
    'constant_keyword',
    'wildcard',
    'ip'
]);
const phraseTypes = new Set([
    'text',
    'match_only_text',
    'keyword',
    'constant_keyword',
    'wildcard'
]);
function filtersInput(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 20 || Buffer.byteLength(JSON.stringify(value)) > 64 * 1024) throw connectionFailure('kibana_filter_invalid', '通用过滤最多 20 条，输入最多 64 KiB。');
    return value.map((item)=>{
        const filter = inputObject(item, [
            'field',
            'op',
            'value'
        ]);
        const field = kibanaText(filter.field, '字段名', 1024);
        if (![
            'eq',
            'match-phrase',
            'exists'
        ].includes(String(filter.op))) throw connectionFailure('kibana_filter_invalid', '过滤操作只支持 eq、match-phrase 或 exists。');
        const op = filter.op;
        if (op === 'exists') {
            if (Object.hasOwn(filter, 'value')) throw connectionFailure('kibana_filter_invalid', 'exists 条件不能包含 value。');
            return {
                field,
                op
            };
        }
        const value = filter.value;
        if (typeof value === 'string') kibanaText(value, '过滤值', 4096, true);
        else if (typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) throw connectionFailure('kibana_filter_invalid', '过滤值必须为有限数值、布尔值或最多 4 KiB 的文本。');
        if (op === 'match-phrase' && typeof value !== 'string') throw connectionFailure('kibana_filter_invalid', 'match-phrase 条件必须使用文本。');
        return {
            field,
            op,
            value
        };
    });
}
export function validateKibanaQueryInput(input, kind, now = new Date()) {
    inputObject(input, [
        ...commonKeys,
        ...kind === 'search' ? [
            'limit',
            'fields',
            'order',
            'messageBytes'
        ] : [
            'field',
            'top'
        ]
    ]);
    if (Buffer.byteLength(JSON.stringify(input)) > 64 * 1024) throw connectionFailure('kibana_filter_invalid', '查询条件输入最多 64 KiB。');
    if (input.dataViewId !== undefined) kibanaText(input.dataViewId, '数据视图编号', 1024);
    kibanaTimeRange(input, now);
    filtersInput(input.filters);
    for (const key of [
        'service',
        'namespace',
        'contains',
        'traceId'
    ])if (input[key] !== undefined) kibanaText(input[key], '查询条件', 4096);
    if (kind === 'search') {
        const search = input;
        kibanaInteger(search.limit, 100, 500);
        kibanaInteger(search.messageBytes, 8192, 256 * 1024);
        if (search.order !== undefined && ![
            'asc',
            'desc'
        ].includes(String(search.order))) throw connectionFailure('kibana_input_invalid', '排序只支持 asc 或 desc。');
        if (search.fields !== undefined) {
            if (!Array.isArray(search.fields) || search.fields.length < 1 || search.fields.length > 20) throw connectionFailure('kibana_input_invalid', '展示字段必须为 1 至 20 个字段的数组。');
            search.fields.forEach((field)=>kibanaText(field, '展示字段名', 1024));
            if (new Set(search.fields).size !== search.fields.length) throw connectionFailure('kibana_input_invalid', '展示字段不能重复。');
        }
    } else {
        const aggregate = input;
        kibanaText(aggregate.field, '统计字段', 1024);
        kibanaInteger(aggregate.top, 10, 100);
    }
}
function fieldError(field, reason) {
    throw connectionFailure('kibana_field_unsupported', `字段 ${field} 不可用于本次操作：${reason}。`, 422);
}
function ordinaryField(view, name, requireSearchable = true) {
    const field = view.fields.find((item)=>item.name === name);
    if (!field) throw connectionFailure('kibana_field_missing', `数据视图（Data View）中不存在字段 ${name}，未删去该条件。`, 422);
    if (field.unsupportedReasons.length) fieldError(name, field.unsupportedReasons.join('、'));
    if (requireSearchable && !field.searchable) fieldError(name, '不可搜索');
    if (!field.esTypes.length || field.esTypes.some((type)=>[
            'object',
            'nested',
            '_source'
        ].includes(type))) fieldError(name, '不是可核验的普通叶字段');
    return field;
}
export function kibanaTimeField(view) {
    if (view.type) throw connectionFailure('kibana_data_view_unsupported', '首版只支持普通 Elasticsearch 数据视图（Data View）。', 422);
    if (!view.timeFieldName) throw connectionFailure('kibana_time_field_unsupported', '当前数据视图（Data View）没有时间字段，未猜测或删除时间条件。', 422);
    const field = ordinaryField(view, view.timeFieldName);
    if (field.esTypes.length !== 1 || ![
        'date',
        'date_nanos'
    ].includes(field.esTypes[0]) || !field.aggregatable) throw connectionFailure('kibana_time_field_unsupported', '当前时间字段必须为普通可搜索且可排序的 date 或 date_nanos，不能有类型冲突。', 422);
    return field;
}
function mappingWarning(field, warnings) {
    if (field.esTypes.length > 1 && !warnings.some((item)=>item.code === 'field_mapping_mixed' && item.field === field.name)) warnings.push({
        code: 'field_mapping_mixed',
        field: field.name,
        message: '字段具有跨索引混合映射；实际精确字段不能证明覆盖全部历史索引。'
    });
}
function exactField(view, name, aggregate, warnings) {
    const original = ordinaryField(view, name);
    const exact = (field)=>field.esTypes.every((type)=>stringTypes.has(type)) || field.esTypes.every((type)=>numericTypes.has(type)) || field.esTypes.length === 1 && field.esTypes[0] === 'boolean';
    let field = original;
    if (!exact(original)) {
        field = ordinaryField(view, name + '.keyword');
        if (!field.esTypes.every((type)=>[
                'keyword',
                'constant_keyword',
                'wildcard'
            ].includes(type))) fieldError(name, '没有可用精确字段');
    }
    if (aggregate && !field.aggregatable) fieldError(name, '实际精确字段不可聚合');
    mappingWarning(original, warnings);
    mappingWarning(field, warnings);
    return field;
}
function typeCheck(field, value) {
    if (field.esTypes.every((type)=>numericTypes.has(type)) ? typeof value !== 'number' : field.esTypes.every((type)=>type === 'boolean') ? typeof value !== 'boolean' : typeof value !== 'string') fieldError(field.name, '输入值与实际映射类型不匹配');
}
function phraseField(view, name, warnings) {
    const field = ordinaryField(view, name);
    if (!field.esTypes.every((type)=>phraseTypes.has(type))) fieldError(name, '不支持短语匹配');
    mappingWarning(field, warnings);
    return field;
}
function queryConditions(view, input, warnings) {
    const conditions = filtersInput(input.filters), resolvedFields = [], clauses = [];
    if (input.service !== undefined) conditions.push({
        field: 'kubernetes.deployment.name',
        op: 'eq',
        value: input.service
    });
    if (input.namespace !== undefined) conditions.push({
        field: 'kubernetes.namespace',
        op: 'eq',
        value: input.namespace
    });
    if (input.contains !== undefined) conditions.push({
        field: 'message',
        op: 'match-phrase',
        value: input.contains
    });
    const resolve = (condition)=>{
        const field = condition.op === 'eq' ? exactField(view, condition.field, false, warnings) : condition.op === 'match-phrase' ? phraseField(view, condition.field, warnings) : ordinaryField(view, condition.field);
        if (condition.op === 'eq') typeCheck(field, condition.value);
        resolvedFields.push({
            requestedField: condition.field,
            field: field.name,
            op: condition.op
        });
        return condition.op === 'exists' ? {
            exists: {
                field: field.name
            }
        } : condition.op === 'eq' ? {
            term: {
                [field.name]: condition.value
            }
        } : {
            match_phrase: {
                [field.name]: condition.value
            }
        };
    };
    conditions.forEach((condition)=>clauses.push(resolve(condition)));
    if (input.traceId !== undefined) {
        const alternatives = [];
        for (const condition of [
            {
                field: 'trace.id',
                op: 'eq'
            },
            {
                field: 'message',
                op: 'match-phrase'
            }
        ]){
            try {
                alternatives.push(resolve({
                    ...condition,
                    value: input.traceId
                }));
            } catch (error) {
                if (![
                    'kibana_field_missing',
                    'kibana_field_unsupported'
                ].includes(error.code || '')) throw error;
            }
        }
        if (!alternatives.length) throw connectionFailure('kibana_trace_path_unsupported', '当前视图没有可用的 trace.id 精确路径或 message 短语路径。', 422);
        conditions.push({
            field: 'trace.id|message',
            op: 'eq',
            value: input.traceId
        });
        clauses.push({
            bool: {
                should: alternatives,
                minimum_should_match: 1
            }
        });
        if (alternatives.length === 1) warnings.push({
            code: 'trace_path_limited',
            message: '本次调用链关联只有一个可用路径，实际路径见 resolvedFields。'
        });
    }
    return {
        conditions,
        resolvedFields,
        clauses
    };
}
function excluded(name, filters, sourceField) {
    return filters.some((pattern)=>{
        const expression = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*').replace(/\?/gu, '.') + '(?:$|\\.)', 'u');
        return expression.test(name) || !!sourceField && expression.test(sourceField);
    });
}
function base(view, input, now) {
    const time = kibanaTimeField(view), timeRange = kibanaTimeRange(input, now), warnings = [];
    const conditions = queryConditions(view, input, warnings);
    const query = {
        bool: {
            filter: [
                {
                    range: {
                        [time.name]: {
                            gte: timeRange.from,
                            lt: timeRange.to,
                            format: 'strict_date_optional_time_nanos'
                        }
                    }
                },
                ...conditions.clauses
            ]
        }
    };
    return {
        time,
        timeRange,
        warnings,
        conditions: conditions.conditions,
        resolvedFields: conditions.resolvedFields,
        query
    };
}
export function buildKibanaSearchQuery(view, input, now = new Date()) {
    validateKibanaQueryInput(input, 'search', now);
    const current = base(view, input, now), limit = kibanaInteger(input.limit, 100, 500), messageBytes = kibanaInteger(input.messageBytes, 8192, 256 * 1024), order = input.order || 'desc';
    const explicit = input.fields !== undefined, names = explicit ? input.fields : [
        ...new Set([
            current.time.name,
            'message',
            'kubernetes.deployment.name',
            'kubernetes.namespace',
            'trace.id',
            'log.level'
        ])
    ];
    const displayFields = [], omittedFields = [];
    for (const name of names){
        if (excluded(name, view.sourceFilters, view.fields.find((field)=>field.name === name)?.sourceField)) {
            if (explicit) throw connectionFailure('kibana_field_excluded', `字段 ${name} 被当前视图的 sourceFilters 排除，不能显式展示。`, 422);
            omittedFields.push({
                field: name,
                reason: 'source_filtered'
            });
            continue;
        }
        try {
            ordinaryField(view, name, false);
            displayFields.push(name);
        } catch (error) {
            if (explicit) throw error;
            omittedFields.push({
                field: name,
                reason: error.code || 'unsupported'
            });
        }
    }
    const messageExcluded = excluded('message', view.sourceFilters), sourceMessage = !messageExcluded && view.fields.some((field)=>field.name === 'message' && !field.unsupportedReasons.length);
    const readFields = [
        ...new Set([
            ...!excluded(current.time.name, view.sourceFilters) ? [
                current.time.name
            ] : [],
            ...displayFields
        ])
    ];
    const body = {
        query: current.query,
        size: limit,
        sort: [
            {
                [current.time.name]: {
                    order,
                    format: 'strict_date_optional_time_nanos',
                    unmapped_type: current.time.esTypes[0]
                }
            }
        ],
        fields: readFields.map((name)=>({
                field: name,
                ...view.fields.find((field)=>field.name === name)?.esTypes.some((type)=>[
                        'date',
                        'date_nanos'
                    ].includes(type)) ? {
                    format: 'strict_date_optional_time_nanos'
                } : {}
            })),
        _source: sourceMessage ? {
            includes: [
                'message'
            ]
        } : false
    };
    return {
        ...current,
        body,
        displayFields,
        readFields,
        omittedFields,
        order,
        messageBytes,
        limit,
        sourceMessage,
        messageUnavailableReason: messageExcluded ? 'source_filtered' : !sourceMessage ? 'field_missing_or_unsupported' : undefined
    };
}
export function buildKibanaAggregateQuery(view, input, now = new Date()) {
    validateKibanaQueryInput(input, 'aggregate', now);
    const current = base(view, input, now), field = input.field, actual = exactField(view, field, true, current.warnings), top = kibanaInteger(input.top, 10, 100);
    current.resolvedFields.push({
        requestedField: field,
        field: actual.name,
        op: 'aggregate'
    });
    return {
        ...current,
        field,
        resolvedField: actual.name,
        top,
        body: {
            query: current.query,
            size: 0,
            _source: false,
            aggs: {
                groups: {
                    terms: {
                        field: actual.name,
                        size: top,
                        show_term_doc_count_error: true
                    }
                }
            }
        }
    };
}
