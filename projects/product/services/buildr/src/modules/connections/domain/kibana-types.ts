export type KibanaConfiguration = { consoleUrl: string; username: string; dataViewId: string | null };
export type KibanaWarning = { code: string; message: string; field?: string };
export type KibanaDataView = { id: string; name: string; title: string; timeFieldName: string | null; type?: string };
export type KibanaField = {
  name: string; type: string; esTypes: string[]; searchable: boolean; aggregatable: boolean;
  readFromDocValues: boolean; unsupportedReasons: string[];
  sourceField?: string;
};
export type KibanaDataViewMetadata = KibanaDataView & {
  fields: KibanaField[]; sourceFilters: string[]; observedAt: string;
};
export type KibanaViewsInput = { name?: unknown; offset?: unknown; limit?: unknown };
export type KibanaFieldsInput = KibanaViewsInput & { dataViewId?: unknown };
export type KibanaFilter = { field: string; op: 'eq' | 'match-phrase' | 'exists'; value?: string | number | boolean };
export type KibanaQueryInput = {
  dataViewId?: unknown; since?: unknown; from?: unknown; to?: unknown;
  service?: unknown; namespace?: unknown; contains?: unknown; traceId?: unknown; filters?: unknown;
};
export type KibanaSearchInput = KibanaQueryInput & { limit?: unknown; fields?: unknown; order?: unknown; messageBytes?: unknown };
export type KibanaAggregateInput = KibanaQueryInput & { field?: unknown; top?: unknown };
export type KibanaTimeRange = { from: string; to: string };
export type KibanaResolvedField = { requestedField: string; field: string; op: string };
export type KibanaExecution = {
  isRunning: boolean; isPartial: boolean; timedOut: boolean;
  shards: { total: number; successful: number; skipped: number; failed: number };
};
export type KibanaBaseResult = { target: string; serverVersion: string | null; warnings: KibanaWarning[]; redactionCount?: number };
export type KibanaViewsResult = KibanaBaseResult & { dataViews: KibanaDataView[]; total: number; offset: number; limit: number; limitReached: boolean };
export type KibanaFieldsResult = KibanaBaseResult & { dataView: KibanaDataView; observedAt: string; fields: KibanaField[]; sourceFilters: string[]; total: number; offset: number; limit: number; limitReached: boolean };
export type KibanaQueryResult = KibanaBaseResult & {
  queryChannel: string; dataView: KibanaDataView; observedAt: string; timeRange: KibanaTimeRange;
  conditions: KibanaFilter[]; resolvedFields: KibanaResolvedField[]; execution: KibanaExecution;
  incomplete: boolean; incompleteReasons: string[];
};
export type KibanaLogRow = {
  _index: string; _id: string; documentIdentityAvailable: boolean; timestamp: unknown[] | null;
  fields: Record<string, unknown[]>; missingFields: string[]; ignoredFields: string[];
  message: string | null; messageUnavailableReason?: string; messageTruncated: boolean; redactionCount: number;
};
export type KibanaSearchResult = KibanaQueryResult & {
  rows: KibanaLogRow[]; rowCount: number; rowLimit: number; limitReached: boolean;
  displayFields: string[]; omittedFields: { field: string; reason: string }[]; order: 'asc' | 'desc'; messageBytes: number;
};
export type KibanaAggregateResult = KibanaQueryResult & {
  field: string; resolvedField: string; top: number; buckets: { key: string | number | boolean; docCount: number }[];
  sumOtherDocCount: number; docCountErrorUpperBound: number; limitReached: boolean;
};
export type KibanaTestResult = { dataView: KibanaDataView; searchVerified: true; queryChannel: string; warnings: KibanaWarning[] };
export type KibanaOperations = {
  views(config: Record<string, unknown>, credentials: Record<string, unknown>, input?: KibanaViewsInput): Promise<KibanaViewsResult>;
  fields(config: Record<string, unknown>, credentials: Record<string, unknown>, input?: KibanaFieldsInput): Promise<KibanaFieldsResult>;
  search(config: Record<string, unknown>, credentials: Record<string, unknown>, input: KibanaSearchInput): Promise<KibanaSearchResult>;
  aggregate(config: Record<string, unknown>, credentials: Record<string, unknown>, input: KibanaAggregateInput): Promise<KibanaAggregateResult>;
};
