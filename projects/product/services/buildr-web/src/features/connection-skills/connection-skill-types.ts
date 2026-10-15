export type ConnectionField = {
  key: string; label: string; type: 'string' | 'url' | 'integer' | 'boolean' | 'enum' | 'select' | 'multiselect' | 'secret';
  required?: boolean; default?: unknown; values?: (string | number | boolean)[]; optionsFrom?: string;
  description?: string; group?: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number;
  dependsOn?: { field: string; equals: unknown };
};
export type ConnectionDefinition = {
  schemaVersion: string; definitionId: string; name: string; description: string; category: string; systemId?: string; configVersion: number;
  config: { fields: ConnectionField[] }; authentication: { fields: ConnectionField[]; targetFields: string[] };
  programs: Record<string, unknown>; hooks?: Record<string, { program: string; args: string[]; effect: 'read'; inputs?: string[] }>;
  presentation?: { summaryFields: string[]; websiteField?: string; categoryLabel?: string; methodLabel?: string; groups?: { id: string; title: string; fields: string[]; collapsed?: boolean }[] };
};
export type CatalogEntry = {
  definition: ConnectionDefinition; skill: { id: string; assetIdentity: string; sourceIdentity: string; sourcePath: string; entryPath: string };
  revision: string; declarationRevision: string; programRecipients: Record<string, { executable: string | null; entry: string | null }>;
  enabled: boolean; available: boolean; diagnostics: { code: string; message: string; field?: string }[];
};
export type ConnectionBinding = { skillAssetIdentity: string; definitionId: string; sourceIdentity: string; configVersion: number };
export type AuthState = { configured: boolean; values: Record<string, unknown>; diagnostic: string | null };
export type ConnectionFieldLabels = Record<string, { value: string; label: string }>;
export type ConnectionInstance = {
  id: string; name: string; environment: string; enabled: boolean; category: string; binding: ConnectionBinding; config: Record<string, unknown>;
  fieldLabels?: ConnectionFieldLabels;
  sourcePath: string; revision: string; teamRevision: string; localRevision: string; definitionRevision: string;
  authentication: { source: 'team' | 'personal'; team: AuthState; personal: AuthState & { present: boolean } };
  availability: { ready: boolean; diagnostics: string[] }; programAvailability: Record<string, { ready: boolean; diagnostics: string[] }>;
  definition?: CatalogEntry; websiteUrl?: string | null;
};
export type AuthenticationInput = { source: 'team' | 'personal'; intent: 'keep' | 'replace'; values?: Record<string, unknown> };
export type HookInput = {
  id?: string; binding: ConnectionBinding; config: Record<string, unknown>;
  expected: { teamRevision: string; definitionRevision: string; localRevision?: string };
  authentication: AuthenticationInput; hook?: string;
};
export type HookResult = {
  status: 'success' | 'failure' | 'unknown'; checks: unknown[]; observedAt: string; diagnostics: unknown[]; limitations: unknown[];
  options?: { value: string; label: string }[]; warnings?: unknown[]; truncated?: boolean;
  authenticationSource: 'team' | 'personal';
};
export type TeamInput = {
  id?: string; name: string; environment: string; enabled: boolean; binding: ConnectionBinding; config: Record<string, unknown>;
  fieldLabels?: ConnectionFieldLabels;
  authentication: { intent: 'keep' | 'replace' | 'remove'; values?: Record<string, unknown> };
  expected: { teamRevision: string; definitionRevision: string };
};
