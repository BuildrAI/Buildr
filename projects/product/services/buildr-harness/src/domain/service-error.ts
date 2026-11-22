/** Lightweight error identity shared by configuration and execution layers. */
export class AgentServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AgentServiceError';
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}
