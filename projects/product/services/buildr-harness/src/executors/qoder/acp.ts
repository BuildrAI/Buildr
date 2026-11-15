import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { nativeCommand, closeOwnedProcess, OwnedControlResource } from '../native-process.ts';
import type { ExecutionRef } from '../../contracts.ts';

export interface AcpUpdate {
  sessionUpdate?: string;
  [key: string]: unknown;
}
export interface AcpServerRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}
export interface AcpClientOptions {
  executable: string;
  args: string[];
  cwd: string;
  environment?: NodeJS.ProcessEnv;
  onNotification(method: string, params: Record<string, unknown>): void;
  onServerRequest(request: AcpServerRequest): Promise<unknown>;
  onExit(reason: string): void;
  diagnostics?(line: string): void;
}

/** Newline-delimited JSON-RPC over stdio. The CLI owns native sessions and tools. */
export class AcpClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly control: OwnedControlResource;
  private closing?: Promise<void>;
  private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout>; onResult?: (value: any) => void }>();
  private nextId = 1;
  private closed = false;
  private exitReason = 'acp_transport_closed';

  private readonly options: AcpClientOptions;

  private constructor(options: AcpClientOptions) {
    this.options = options;
    const command = nativeCommand(options.executable);
    this.control=new OwnedControlResource(command.command,[...command.prefix,...options.args],{cwd:options.cwd,env:options.environment??process.env});
    this.child=this.control.child;
    createInterface({ input: this.child.stdout }).on('line', line => this.receive(line));
    // Native stderr never becomes a user-visible payload; it is only a transport signal.
    createInterface({ input: this.child.stderr }).on('line', line => { try { options.diagnostics?.(line); } catch { /* diagnostics stay private */ } });
    this.child.once('exit', () => this.fail('acp_process_exited'));
    this.child.once('error', () => this.fail('acp_process_failed'));
  }

  static open(options: AcpClientOptions): AcpClient { return new AcpClient(options); }

  get transportClosed(): boolean { return this.closed; }
  get closedReason(): string { return this.exitReason; }
  executionRef(id:string,contextId:string,binding:string):ExecutionRef { return this.control.executionRef(id,contextId,binding); }
  async stopExecution(ref:ExecutionRef,contextId:string,binding:string):Promise<boolean> {
    return this.control.stopExecution(ref,contextId,binding);
  }
  async released(ref:ExecutionRef,contextId:string,binding:string,ended:boolean):Promise<boolean> {
    return this.control.canReleaseExecution(ref,contextId,binding,ended,this.closed);
  }

  private receive(line: string): void {
    if (!line.trim()) return;
    let message: any;
    try { message = JSON.parse(line); } catch { return; }
    if (!message || typeof message !== 'object') return;
    if (typeof message.method === 'string' && message.id !== undefined) { void this.answerServerRequest(message); return; }
    if (typeof message.method === 'string') { try { this.options.onNotification(message.method, message.params ?? {}); } catch { /* projection keeps the transport */ } return; }
    if (message.id === undefined) return;
    const waiting = this.pending.get(message.id);
    if (!waiting) return;
    this.pending.delete(message.id);
    if (waiting.timer) clearTimeout(waiting.timer);
    if (message.error) waiting.reject(Object.assign(new Error(typeof message.error.message === 'string' ? message.error.message : 'acp_request_failed'), { acpCode: message.error.code }));
    else {
      try { waiting.onResult?.(message.result); waiting.resolve(message.result); }
      catch(error) { waiting.reject(error instanceof Error ? error : new Error('acp_result_projection_failed')); }
    }
  }

  private async answerServerRequest(request: { id: number; method: string; params?: Record<string, unknown> }): Promise<void> {
    try {
      const result = await this.options.onServerRequest({ id: request.id, method: request.method, params: request.params ?? {} });
      if (!this.closed) this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    } catch (error) {
      if (this.closed) return;
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: error instanceof Error ? error.message : 'acp_server_request_failed' } }) + '\n');
    }
  }

  request<T = any>(method: string, params: Record<string, unknown>, timeoutMs = 60_000, onResult?: (value: T) => void): Promise<T> {
    if (this.closed) return Promise.reject(new Error(this.exitReason));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => { this.pending.delete(id); reject(new Error('acp_request_timeout')); }, timeoutMs) : undefined;
      timer?.unref?.();
      this.pending.set(id, { resolve, reject, timer, onResult });
      try { this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }
      catch (error) { this.pending.delete(id); if (timer) clearTimeout(timer); reject(error instanceof Error ? error : new Error('acp_transport_write_failed')); }
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    if (this.closed) return;
    try { this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); } catch { /* transport loss is observed by exit */ }
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.closed = true; this.exitReason = reason;
    for (const [, waiting] of this.pending) { if (waiting.timer) clearTimeout(waiting.timer); waiting.reject(new Error(reason)); }
    this.pending.clear();
    try { this.options.onExit(reason); } catch { /* owned caller decides recovery */ }
  }

  async close(): Promise<void> {
    if(this.closing)return this.closing;
    // A failed transport does not prove that its owned child has exited.
    this.fail('acp_closed');
    this.closing=closeOwnedProcess(this.child);
    return this.closing;
  }
}
