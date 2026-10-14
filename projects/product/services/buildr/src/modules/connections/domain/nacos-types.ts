export type NacosApiVersion = 'v1' | 'v2' | 'v3';
export type NacosConfiguration = { consoleUrl: string; username: string; namespaceId: string; defaultGroup: string; production: boolean; apiVersion: 'auto' | NacosApiVersion };
export type NacosNamespace = { namespaceId: string; namespaceName: string; configCount?: number };
export type NacosConfigSummary = { dataId: string; group: string; type: string | null; md5: string | null };
export type NacosConfigPage = { namespaceId: string; apiVersion: NacosApiVersion; pageNo: number; pageSize: number; totalCount: number; pagesAvailable: number; items: NacosConfigSummary[] };
export type NacosConfigMetadata = { appName?: string; desc?: string; configTags?: string; use?: string; effect?: string; schema?: string };
export type NacosConfigDetail = { namespaceId: string; apiVersion: NacosApiVersion; dataId: string; group: string; content: string; type: string | null; md5: string; metadata?: NacosConfigMetadata };
export type NacosPublishResult = { published: true; verified: boolean; namespaceId: string; apiVersion: NacosApiVersion; dataId: string; group: string; expectedMd5: string; md5: string | null; verificationError?: { code: string; message: string }; concurrencyProtection: 'native-cas' | 'preflight-recheck'; concurrencyWarning?: string; upstreamCasLimit?: string };
export type NacosListInput = { dataId?: unknown; group?: unknown; pageNo?: unknown; pageSize?: unknown };
export type NacosGetInput = { dataId: unknown; group?: unknown };
export type NacosPublishInput = NacosGetInput & { content: unknown; expectedMd5: unknown; type?: unknown };
export type NacosOperations = {
  namespaces(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<NacosNamespace[]>;
  configs(config: Record<string, unknown>, credentials: Record<string, unknown>, input: NacosListInput): Promise<NacosConfigPage>;
  get(config: Record<string, unknown>, credentials: Record<string, unknown>, input: NacosGetInput): Promise<NacosConfigDetail>;
  publish(config: Record<string, unknown>, credentials: Record<string, unknown>, input: NacosPublishInput): Promise<NacosPublishResult>;
};
