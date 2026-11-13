import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { ExecutionDiagnosticSink, ExecutionRef } from '../../contracts.ts';
import { closeOwnedProcess, nativeCommand, OwnedControlResource } from '../native-process.ts';

export interface AntigravityAcpServerRequest {
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface AntigravityAcpClientOptions {
  executable: string;
  args: string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  diagnostics?: ExecutionDiagnosticSink;
  onNotification?(method: string, params: Record<string, unknown>): void;
  onServerRequest?(request: AntigravityAcpServerRequest): Promise<unknown>;
  onExit?(reason: string): void;
}

/**
 * Newline-delimited JSON-RPC 2.0 over stdio for `agy acp`.
 * Each instance owns its own `OwnedControlResource` and detached OS process group.
 */
export class AntigravityAcpClient {
  private readonly child: ChildProcessWithoutNullStreams;
  readonly control: OwnedControlResource;
  private closing?: Promise<void>;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
      onResult?: (value: any) => void;
    }
  >();
  private nextId = 1;
  private closed = false;
  private exitReason = 'acp_transport_closed';
  private readonly options: AntigravityAcpClientOptions;

  private constructor(options: AntigravityAcpClientOptions) {
    this.options = options;
    const cmd = nativeCommand(options.executable);
    this.control = new OwnedControlResource(cmd.command, [...cmd.prefix, ...options.args], {
      cwd: options.cwd,
      env: options.environment,
      diagnostics: options.diagnostics,
    });
    this.child = this.control.child;
    createInterface({ input: this.child.stdout }).on('line', line => this.receive(line));
    // Native stderr never becomes user-visible content or raw logs.
    createInterface({ input: this.child.stderr }).on('line', () => {});
    this.child.once('exit', () => this.fail('acp_process_exited'));
    this.child.once('error', () => this.fail('acp_process_failed'));
  }

  static open(options: AntigravityAcpClientOptions): AntigravityAcpClient {
    return new AntigravityAcpClient(options);
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get transportClosed(): boolean {
    return this.closed;
  }

  get closedReason(): string {
    return this.exitReason;
  }

  executionRef(id: string, contextId: string, binding: string, backgroundWork = false): ExecutionRef {
    return this.control.executionRef(id, contextId, binding, backgroundWork);
  }

  async stopExecution(ref: ExecutionRef, contextId: string, binding: string): Promise<boolean> {
    return this.control.stopExecution(ref, contextId, binding);
  }

  async released(ref: ExecutionRef, contextId: string, binding: string, ended: boolean): Promise<boolean> {
    return this.control.canReleaseExecution(ref, contextId, binding, ended, this.closed);
  }

  private receive(line: string): void {
    if (!line.trim()) return;
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (typeof message.method === 'string' && message.id !== undefined) {
      void this.answerServerRequest(message);
      return;
    }
    if (typeof message.method === 'string') {
      try {
        this.options.onNotification?.(message.method, message.params ?? {});
      } catch {
        // Projection error never crashes transport control.
      }
      return;
    }
    if (message.id === undefined) return;
    const waiting = this.pending.get(Number(message.id));
    if (!waiting) return;
    this.pending.delete(Number(message.id));
    if (waiting.timer) clearTimeout(waiting.timer);
    if (message.error) {
      const err = Object.assign(
        new Error(typeof message.error.message === 'string' ? message.error.message : 'acp_request_failed'),
        { acpCode: message.error.code },
      );
      waiting.reject(err);
    } else {
      try {
        waiting.onResult?.(message.result);
        waiting.resolve(message.result);
      } catch (error) {
        waiting.reject(error instanceof Error ? error : new Error('acp_result_projection_failed'));
      }
    }
  }

  private async answerServerRequest(request: { id: number | string; method: string; params?: Record<string, unknown> }): Promise<void> {
    try {
      if (!this.options.onServerRequest) throw new Error('acp_server_request_unsupported');
      const result = await this.options.onServerRequest({
        id: request.id,
        method: request.method,
        params: request.params ?? {},
      });
      if (!this.closed) {
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
      }
    } catch (error) {
      if (this.closed) return;
      this.child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: error instanceof Error ? error.message : 'acp_server_request_failed' },
        })}\n`,
      );
    }
  }

  requestWithId<T = any>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 60_000,
    onResult?: (value: T) => void,
  ): { requestId: number; promise: Promise<T> } {
    const id = this.nextId++;
    if (this.closed) {
      return { requestId: id, promise: Promise.reject(new Error(this.exitReason)) };
    }
    const promise = new Promise<T>((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(new Error('acp_request_timeout'));
          }, timeoutMs)
        : undefined;
      timer?.unref?.();
      this.pending.set(id, { resolve, reject, timer, onResult });
      try {
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      } catch (error) {
        this.pending.delete(id);
        if (timer) clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('acp_transport_write_failed'));
      }
    });
    return { requestId: id, promise };
  }

  request<T = any>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 60_000,
    onResult?: (value: T) => void,
  ): Promise<T> {
    return this.requestWithId<T>(method, params, timeoutMs, onResult).promise;
  }

  notify(method: string, params: Record<string, unknown>): void {
    if (this.closed) return;
    try {
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    } catch {
      // Observed via child exit.
    }
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.exitReason = reason;
    for (const [, waiting] of this.pending) {
      if (waiting.timer) clearTimeout(waiting.timer);
      waiting.reject(new Error(reason));
    }
    this.pending.clear();
    try {
      this.options.onExit?.(reason);
    } catch {
      // Owner handles recovery.
    }
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.fail('acp_closed');
    this.closing = closeOwnedProcess(this.child);
    return this.closing;
  }
}
