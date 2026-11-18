/** Lightweight error identity shared by configuration and execution layers. */
export class AgentServiceError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'AgentServiceError';
    this.code = code;
    this.status = status;
  }
}
