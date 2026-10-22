import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

export type ManagedProcess = {
  pid: number;
  kill(): Promise<void>;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

export function startManagedProcess(options: {
  command: string[];
  cwd: string;
  onOutput(chunk: string): void;
}): ManagedProcess {
  const [binary, ...args] = options.command;
  const child = spawn(binary, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let buffer = '';
  const consume = (data: Buffer) => {
    buffer += data.toString('utf8');
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      options.onOutput(buffer.slice(0, index + 1));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf('\n');
    }
  };
  child.stdout?.on('data', consume);
  child.stderr?.on('data', consume);
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.on('exit', (code, signal) => {
      if (buffer) {
        options.onOutput(buffer);
        buffer = '';
      }
      resolve({ code, signal });
    });
  });
  const kill = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    force.unref?.();
    await exited;
    clearTimeout(force);
  };
  return { pid: child.pid ?? -1, kill, exited };
}

export function probePortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

export function probeHttpStatus(port: number, path: string): Promise<number | null> {
  return new Promise(resolve => {
    const request = http.get({ host: '127.0.0.1', port, path, timeout: 2000 }, response => {
      resolve(response.statusCode ?? null);
      response.resume();
    });
    request.on('error', () => resolve(null));
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
  });
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
