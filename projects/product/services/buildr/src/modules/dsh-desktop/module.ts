import { AGENT_OPERATIONS_APPLICATION, type AgentOperationsApplication } from '../agent-operations/module.ts';
import { DshDesktopApplication } from './application/dsh-desktop-application.ts';
import { createDshDesktopHttpContribution } from './interfaces/http/dsh-desktop-http.ts';
import { DshPageObservations } from './application/dsh-page-observations.ts';
export const DSH_DESKTOP_APPLICATION = 'dsh-desktop.application';
export const DSH_PAGE_OBSERVATIONS = 'dsh-desktop.page-observations';
export { DshDesktopApplication } from './application/dsh-desktop-application.ts';
export function createDshDesktopModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string }; readOrigin(profile: { dataRoot: string }): string | null }) {
  return Object.freeze({ id: 'dsh-desktop', requires: Object.freeze([AGENT_OPERATIONS_APPLICATION]), create(requires: Record<string, any>) {
    const profile = options.resolveWebProfile(options.readProductIdentity()), agents = requires[AGENT_OPERATIONS_APPLICATION] as AgentOperationsApplication;
    const application = new DshDesktopApplication({ dataRoot: profile.dataRoot, readRegistrationActive: id => agents.hasDshRegistration(id), readOrigin: () => options.readOrigin(profile) });
    const pages = new DshPageObservations({ readOrigin: () => options.readOrigin(profile) });
    agents.bindDshDesktopConnector(application);
    return Object.freeze({ provides: { [DSH_DESKTOP_APPLICATION]: application, [DSH_PAGE_OBSERVATIONS]: pages }, contributions: { http: [createDshDesktopHttpContribution(application, pages)] }, lifecycle: { start() {}, async stop() { pages.close(); await application.close(); } } });
  } });
}
