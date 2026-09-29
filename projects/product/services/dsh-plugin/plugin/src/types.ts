/** Public address/identity response; no credentials cross into the Client. */
export type OpenResult =
  | { ready: true; url: string; channel: 'released' | 'development'; ownershipIdentity: string }
  | { ready: false; code: string; message: string };

/**
 * Host configuration. `binding` is the machine pointer to this Buildr installation and is optional:
 * a package installed from npm or a repository carries no machine paths, and the plugin discovers
 * Buildr itself on first use. There is deliberately no channel field — each plugin package serves
 * exactly one installation, decided by the package, not by the user.
 */
export interface Config {
  binding?: {
    nodeExecutable: string;
    cliEntry: string;
    nodeSha256?: string;
    cliSha256?: string;
  };
  timeoutMs?: number;
  pollMs?: number;
}
