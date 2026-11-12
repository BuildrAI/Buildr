import type { AgentProgramUpgradeProgramUpgrade } from '../../../build/generated/agent-service-http-dto';
export type ProgramUpgradeView = AgentProgramUpgradeProgramUpgrade;
import type { AgentProgramUpdatesProgramUpdates } from '../../../build/generated/agent-service-http-dto';
export type ProgramUpdatesView = AgentProgramUpdatesProgramUpdates;
import type { AgentModelAccountModelAccount, AgentModelAccountsModelAccounts, AgentModelCatalogModelCatalog } from '../../../build/generated/agent-service-http-dto';
export type ModelAccount = AgentModelAccountModelAccount;
export type CatalogModel = AgentModelCatalogModelCatalog['models'][number];
export type ModelProviderView = AgentModelAccountsModelAccounts['providers'][number];
import type { AgentServiceConnectionConnection, AgentConversationConversation, AgentConversationDraftRequestDraft, AgentConversationSendPreviewPreview, AgentConversationEventEvent, AgentConversationAttachmentResultAttachmentResult } from '../../../build/generated/agent-service-http-dto';
import type { AgentServicePreparationPreparation } from '../../../build/generated/agent-service-http-dto';

// Display choices are the three validated executors; HTTP views come from the host schema.
export type ProviderId = 'codex' | 'dsh' | 'qoder' | 'qoder-cn' | 'claude-code';
export const providerNames: Record<string,string> = {codex:'Codex',dsh:'DSH',qoder:'Qoder','qoder-cn':'Qoder CN','claude-code':'Claude Code'};
export type ConnectionView = AgentServiceConnectionConnection;
export type PreparationView = AgentServicePreparationPreparation;
export type ConversationView = AgentConversationConversation;
export type ConversationTaskLink = {workspaceId:string;taskId:string};
export type ConversationRun = NonNullable<ConversationView['run']>;
export type RunStatus = ConversationRun['status'];
export type ConversationEntry = ConversationView['entries'][number];
export type ConversationRequest = ConversationView['requests'][number];
export type ConversationEvent = AgentConversationEventEvent;
export type SendDraft = AgentConversationDraftRequestDraft;
export type SendInput = SendDraft;
export type SendPreview = AgentConversationSendPreviewPreview;
export type AttachmentView = AgentConversationAttachmentResultAttachmentResult;
export type ConversationSummary = Omit<ConversationView,'entries'|'requests'> & {entries?:ConversationEntry[];requests?:ConversationRequest[]};
export type PendingConversation = {conversationId:string;workspaceId:string;title:string;status:RunStatus;count?:number};

export type { AgentConversationSupplementRequestSupplement as SupplementInput, AgentConversationSupplementResultSupplemented as SupplementResult } from '../../../build/generated/agent-service-http-dto';
