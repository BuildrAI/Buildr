import { StringDecoder } from 'node:string_decoder';
import { stripVTControlCharacters } from 'node:util';

type Output = 'stdout' | 'stderr';
const MAX_LINE = 8192;
const MAX_DETAILS = 1600;
const MAX_LINES = 6;

/** Keep only a bounded, redacted failure summary; never persist raw npm output. */
export class ProgramInstallDiagnostics {
  private readonly streams = {
    stdout: { decoder: new StringDecoder('utf8'), pending: '', dropping: false },
    stderr: { decoder: new StringDecoder('utf8'), pending: '', dropping: false },
  };
  private readonly secrets: string[];
  private readonly details: string[] = [];
  private stage = '';
  private destination = '';

  constructor(environment: NodeJS.ProcessEnv) {
    const secrets = new Set<string>();
    for (const [key, value] of Object.entries(environment)) {
      if (!value) continue;
      if (/(?:token|password|passwd|secret|api_?key|_auth)/i.test(key)) secrets.add(value);
      if (/proxy$/i.test(key)) {
        try {
          const url = new URL(value);
          for (const part of [url.username, url.password]) {
            if (part) { secrets.add(part); try { secrets.add(decodeURIComponent(part)); } catch { /* Preserve encoded value. */ } }
          }
        } catch { /* Invalid proxy values are never copied into a summary. */ }
      }
    }
    this.secrets = [...secrets].filter(value => value.length >= 4).sort((a, b) => b.length - a.length);
  }

  append(output: Output, chunk: Buffer): void {
    this.consume(output, this.streams[output].decoder.write(chunk));
  }

  failure(status: number | null, signal: NodeJS.Signals | null = null, timedOut = false): string {
    for (const output of ['stdout', 'stderr'] as const) {
      this.consume(output, this.streams[output].decoder.end());
      const stream = this.streams[output];
      if (!stream.dropping && stream.pending) this.line(stream.pending);
      stream.pending = '';
    }
    const exit = signal ? `信号 ${signal}` : `退出码 ${status ?? '未知'}`;
    const heading = timedOut ? `程序准备超时（10 分钟，${exit}）` : `程序准备失败（${exit}）`;
    const stage = this.stage ? `最近准备阶段：${this.stage}。` : '';
    const destination = this.destination ? `下载来源：${this.destination}。` : '';
    return `${heading}。${stage}${destination}${this.details.length ? `安装器错误：${this.details.join('；')}` : '安装器未返回可用的错误详情，无法确定底层原因。'}`;
  }

  startFailure(error: NodeJS.ErrnoException): string {
    // Process error messages can contain paths and credentials; retain the actual errno only.
    const code = error.code && /^E[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : '未知错误码';
    return `无法启动安装进程（${code}）。${code === 'ENOENT' ? '安装所需的程序或目录不存在。' : code === 'EACCES' || code === 'EPERM' ? '系统拒绝执行安装程序。' : '安装进程尚未开始下载。'}`;
  }

  private consume(output: Output, text: string): void {
    const stream = this.streams[output];
    const parts = text.split(/[\r\n]/);
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]!;
      if (!stream.dropping) {
        if (stream.pending.length + part.length > MAX_LINE) { stream.pending = ''; stream.dropping = true; }
        else stream.pending += part;
      }
      if (index < parts.length - 1) {
        if (!stream.dropping) this.line(stream.pending);
        stream.pending = ''; stream.dropping = false;
      }
    }
  }

  private line(raw: string): void {
    const plain = stripVTControlCharacters(raw).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
    if (!plain) return;
    if (/Downloading:|request to|\bGET\b/i.test(plain)) {
      const address = plain.match(/\bhttps?:\/\/[^\s"'<>]+/i)?.[0];
      if (address) { try { this.destination = new URL(address).origin; } catch { /* No valid destination observed. */ } }
    }
    if (/Downloading:/i.test(plain)) this.stage = /\.sha256\b/i.test(plain) ? '下载校验文件' : /manifest\.json\b/i.test(plain) ? '读取下载清单' : '下载程序文件';
    if (/\b(?:tar|powershell|unzip)\b.*(?:failed|ENOENT|not found|not recognized)|Expand-Archive.*(?:failed|error)|tar:.*(?:Error|Cannot)|extract(?:ion|ing)?.*(?:failed|error|ENOENT)/i.test(plain)) this.stage = '解压程序文件';
    if (/Checksum verification failed|EINTEGRITY/i.test(plain)) this.stage = '校验下载文件';
    if (!/^npm\s+(?:ERR!|error)\s/i.test(plain) && !/(?:\b(?:error|failed|failure|exception|errno|reason|ENOSPC|ENOENT|EACCES|EPERM)\b|not recognized|not found|denied|失败|错误)/i.test(plain)) return;
    // npm boilerplate adds no cause and can contain private paths or full commands.
    if (/^npm\s+(?:ERR!|error)\s+(?:path\b|cwd\b|command\b|logfile\b|A complete log\b)/i.test(plain)) return;
    let safe = plain.replace(/^npm\s+(?:ERR!|error)\s*/i, '');
    // URLs contribute the destination only: credentials, paths, query strings and fragments stay private.
    safe = safe.replace(/\b(?:https?|socks(?:4|5|5h)?):\/\/[^\s"'<>]+/gi, value => {
      try { return new URL(value).origin.replace(/^null$/, '[地址已隐藏]'); } catch { return '[地址已隐藏]'; }
    });
    for (const secret of this.secrets) safe = safe.split(secret).join('[已隐藏]');
    safe = safe
      .replace(/(?:["']?(?:authorization|proxy-authorization|(?:set-)?cookie|(?:npm_config_)?_auth(?:token)?|(?:access_|refresh_)?token|password|passwd|api[_-]?key|secret|client_secret)["']?\s*[:=]\s*).*$/i, '[认证信息已隐藏]')
      .replace(/--(?:token|access-token|password|passwd|api-key|secret)\s+(?:"[^"]*"|'[^']*'|\S+)/gi, '[认证信息已隐藏]')
      .replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[认证信息已隐藏]')
      .replace(/\b(?:npm_[A-Za-z0-9]{8,}|(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, '[认证信息已隐藏]')
      .trim();
    if (!safe || safe === '[认证信息已隐藏]' || /^code\s+\d+$/i.test(safe)) return;
    // Standalone JSON/string values add no failure context and may continue a credential field.
    if (/^(?:[{}\[\],]+|".*"[,;]?|'.*'[,;]?)$/.test(safe)) return;
    // An overlong line is omitted whole, so truncation cannot leave half a secret visible.
    if (safe.length > MAX_DETAILS) return;
    const previous = this.details.indexOf(safe);
    if (previous !== -1) this.details.splice(previous, 1);
    this.details.push(safe);
    while (this.details.length > MAX_LINES || this.details.join('；').length > MAX_DETAILS) this.details.shift();
  }
}
