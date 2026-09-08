import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

let activeMutation: { writeCount?: number } | null = null;

export function setAtomicWriteMutationObserver(mutation: { writeCount?: number } | null): void {
  activeMutation = mutation;
}

export function atomicWriteFile(file: string, content: string | NodeJS.ArrayBufferView, encoding: BufferEncoding = 'utf8', options: Record<string, unknown> = {}): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.buildr-tmp-${process.pid}-${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(temporary, content, { encoding, ...options });
    try {
      const descriptor = fs.openSync(temporary, 'r');
      try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    } catch {}
    fs.renameSync(temporary, file);
    if (activeMutation && process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE) {
      activeMutation.writeCount = (activeMutation.writeCount || 0) + 1;
      if (activeMutation.writeCount === Number(process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE)) throw new Error(`Injected Buildr mutation failure after write ${activeMutation.writeCount}.`);
    }
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

export function atomicWriteJson(file: string, value: unknown, options: Record<string, unknown> = {}): void {
  atomicWriteFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8', options);
}
