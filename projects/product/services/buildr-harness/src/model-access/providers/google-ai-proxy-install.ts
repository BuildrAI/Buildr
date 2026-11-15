import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { crc32, createGunzip, createInflateRaw } from 'node:zlib';
import { privateDirectories } from '../../executors/native-process.ts';
import { finalizeManifestExecutable } from '../../executors/program-archive.ts';
import { fetchCheckedHttps } from '../../executors/program-release.ts';
import { ModelAccessError } from '../contracts.ts';

export const CLIPROXY_VERSION = '8.0.69';
export const CLIPROXY_RELEASE_BASE_URL = `https://github.com/router-for-me/CLIProxyAPI/releases/download/v${CLIPROXY_VERSION}/`;
export const CLIPROXY_ALLOWED_HOSTS = [
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
] as const;

const DEFAULT_MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_EXTRACTED_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_ARCHIVE_MEMBERS = 32;
const MAX_TRAILING_ZERO_BYTES = 64 * 1024;
const TAR_BLOCK_SIZE = 512;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

export interface CliProxyReleaseAsset {
  filename: string;
  sha256: string;
  archiveKind: 'tar.gz' | 'zip';
  member: string;
}

export const CLIPROXY_RELEASES: Readonly<Record<string, CliProxyReleaseAsset>> = {
  'darwin:arm64': {
    filename: `CLIProxyAPI_${CLIPROXY_VERSION}_darwin_aarch64.tar.gz`,
    sha256: '44070a946dd8932829a52e5d15fe8f01c3748afbbdacc17b10f5a42ce7dba263',
    archiveKind: 'tar.gz',
    member: 'cli-proxy-api',
  },
  'darwin:x64': {
    filename: `CLIProxyAPI_${CLIPROXY_VERSION}_darwin_amd64.tar.gz`,
    sha256: 'dc9b9e782cf1266eedb9c7102ade1f263027af2cf509c8175e156b74bda994d6',
    archiveKind: 'tar.gz',
    member: 'cli-proxy-api',
  },
  'linux:arm64': {
    filename: `CLIProxyAPI_${CLIPROXY_VERSION}_linux_aarch64.tar.gz`,
    sha256: '19f13e62643ea9f6275553622ad13f945e551397166f099a78c32a2e0f85d4c3',
    archiveKind: 'tar.gz',
    member: 'cli-proxy-api',
  },
  'linux:x64': {
    filename: `CLIProxyAPI_${CLIPROXY_VERSION}_linux_amd64.tar.gz`,
    sha256: '4213723d57096bc97ad32d810b89653ba3edeb384087cecc90956c4c33e8af22',
    archiveKind: 'tar.gz',
    member: 'cli-proxy-api',
  },
  'win32:arm64': {
    filename: `CLIProxyAPI_${CLIPROXY_VERSION}_windows_aarch64.zip`,
    sha256: 'a1ed6295bc96f20f5745ff7a1bdc5b1145ccfd06299e2811a045633705c304af',
    archiveKind: 'zip',
    member: 'cli-proxy-api.exe',
  },
  'win32:x64': {
    filename: `CLIProxyAPI_${CLIPROXY_VERSION}_windows_amd64.zip`,
    sha256: 'c81830b40c69d3d4d44b4fb9721827ffc8d3c686ebc69e16aea3af5636d54517',
    archiveKind: 'zip',
    member: 'cli-proxy-api.exe',
  },
};

export interface CliProxyInstallLimits {
  maxDownloadBytes?: number;
  maxExtractedBytes?: number;
  maxMembers?: number;
}

export interface EnsureCliProxyOptions {
  platform?: NodeJS.Platform;
  arch?: string;
  fetch?: typeof fetch;
  releaseBaseUrl?: string;
  allowedHosts?: readonly string[];
  releases?: Readonly<Partial<Record<string, CliProxyReleaseAsset>>>;
  limits?: CliProxyInstallLimits;
  signal?: AbortSignal;
}

export function cliProxyBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'cli-proxy-api.exe' : 'cli-proxy-api';
}

function resolveCliProxyAsset(
  platform: NodeJS.Platform,
  arch: string,
  releases: Readonly<Partial<Record<string, CliProxyReleaseAsset>>>,
): CliProxyReleaseAsset {
  const asset = releases[`${platform}:${arch}`];
  if (!asset) {
    throw new ModelAccessError('model_google_ai_platform_unsupported', `当前平台（${platform}/${arch}）暂不支持自动下载 Google AI 代理程序。`, 400);
  }
  return asset;
}

function isAllZero(block: Buffer): boolean {
  for (let i = 0; i < block.length; i++) {
    if (block[i] !== 0) return false;
  }
  return true;
}

function readNullTerminatedUtf8(field: Buffer): string {
  const zero = field.indexOf(0);
  const slice = zero >= 0 ? field.subarray(0, zero) : field;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return decoder.decode(slice);
}

function parseOctalField(field: Buffer): number | undefined {
  let raw: string;
  try {
    raw = readNullTerminatedUtf8(field).trim();
  } catch {
    return undefined;
  }
  if (!/^[0-7]+$/.test(raw)) return undefined;
  const value = Number.parseInt(raw, 8);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function verifyTarChecksum(header: Buffer): boolean {
  const expected = parseOctalField(header.subarray(148, 156));
  if (expected === undefined) return false;
  let unsignedSum = 0;
  for (let i = 0; i < TAR_BLOCK_SIZE; i++) {
    unsignedSum += i >= 148 && i < 156 ? 0x20 : header[i]!;
  }
  return unsignedSum === expected;
}

function normalizeMemberPath(rawPath: string): string | undefined {
  if (!rawPath || rawPath.includes('\0') || rawPath.includes('\\') || rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)) {
    return undefined;
  }
  const stripped = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath;
  if (!stripped) return undefined;
  const segments = stripped.split('/');
  if (segments.some(seg => seg === '' || seg === '.' || seg === '..')) return undefined;
  return segments.join('/');
}

async function writeAll(handle: fs.FileHandle, chunk: Uint8Array): Promise<void> {
  let written = 0;
  while (written < chunk.byteLength) {
    const result = await handle.write(chunk, written, chunk.byteLength - written);
    if (result.bytesWritten <= 0) {
      throw new ModelAccessError('model_google_ai_install_failed', '写入 Google AI 代理程序文件失败，请重试。', 500);
    }
    written += result.bytesWritten;
  }
}

function mapReleaseError(error: unknown): never {
  if (error instanceof ModelAccessError) throw error;
  if (error instanceof Error && error.name === 'AbortError') throw error;
  const code = error instanceof Error ? error.message : '';
  if (code.includes('redirect_disallowed') || code.includes('redirect_exceeded')) {
    throw new ModelAccessError('model_google_ai_download_disallowed', 'Google AI 代理程序下载地址不受信任，已取消安装。', 502);
  }
  throw new ModelAccessError('model_google_ai_download_failed', '下载 Google AI 代理程序失败，请检查网络连接后重试。', 502);
}

async function downloadAndVerifySha256(
  url: string,
  expectedSha256: string,
  allowedHosts: readonly string[],
  destinationFile: string,
  signal: AbortSignal,
  options: { fetchImpl?: typeof fetch; maxDownloadBytes: number },
): Promise<void> {
  let response: Response;
  try {
    ({ response } = await fetchCheckedHttps(
      url,
      allowedHosts,
      AbortSignal.any([signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]),
      {
        fetchImpl: options.fetchImpl,
        maxRedirects: 5,
        errorPrefix: 'agent_install',
      },
    ));
  } catch (error) {
    signal.throwIfAborted();
    mapReleaseError(error);
  }

  const hash = createHash('sha256');
  const reader = response.body!.getReader();
  let downloaded = 0;
  const handle = await fs.open(destinationFile, 'wx', 0o600);
  try {
    while (true) {
      signal.throwIfAborted();
      const step = await reader.read();
      if (step.done) break;
      downloaded += step.value.byteLength;
      if (downloaded > options.maxDownloadBytes) {
        throw new ModelAccessError('model_google_ai_archive_too_large', 'Google AI 代理程序安装包超出大小限制，已中止安装。', 502);
      }
      hash.update(step.value);
      await writeAll(handle, step.value);
    }
  } catch (error) {
    signal.throwIfAborted();
    mapReleaseError(error);
  } finally {
    await handle.close().catch(() => {});
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  signal.throwIfAborted();
  const actualDigest = hash.digest('hex');
  if (actualDigest !== expectedSha256.toLowerCase()) {
    await fs.rm(destinationFile, { force: true });
    throw new ModelAccessError('model_google_ai_digest_mismatch', 'Google AI 代理程序校验未通过（SHA-256 不匹配），已取消安装。', 502);
  }
}

function assertSafeOutputTarget(stagingRoot: string, outputFile: string): string {
  const resolvedRoot = path.resolve(stagingRoot);
  const resolvedOut = path.resolve(outputFile);
  const relOut = path.relative(resolvedRoot, resolvedOut);
  if (!relOut || relOut === '..' || relOut.startsWith('..' + path.sep) || path.isAbsolute(relOut)) {
    throw new ModelAccessError('model_google_ai_archive_invalid', 'Google AI 代理程序解压输出路径无效。', 502);
  }
  return resolvedOut;
}

/** Extract one named regular-file member from a `.tar.gz` archive in-process while skipping benign sibling regular files. */
export async function extractTarGzNamedMember(
  archiveFile: string,
  stagingRoot: string,
  expectedMemberRaw: string,
  outputFile: string,
  signal: AbortSignal,
  limits: CliProxyInstallLimits = {},
): Promise<void> {
  const expectedMember = normalizeMemberPath(expectedMemberRaw);
  if (!expectedMember) {
    throw new ModelAccessError('model_google_ai_archive_invalid', 'Google AI 代理程序声明的归档成员路径无效。', 502);
  }
  const resolvedOut = assertSafeOutputTarget(stagingRoot, outputFile);
  const maxExtractedBytes = limits.maxExtractedBytes ?? DEFAULT_MAX_EXTRACTED_BYTES;
  const maxMembers = limits.maxMembers ?? DEFAULT_MAX_ARCHIVE_MEMBERS;

  const headerBuf = Buffer.alloc(TAR_BLOCK_SIZE);
  let headerFilled = 0;
  let state: 'header' | 'payload' | 'padding' | 'eof' = 'header';
  let remainingPayload = 0;
  let remainingPadding = 0;
  let zeroBlocks = 0;
  let trailingZeroBytes = 0;
  let memberCount = 0;
  let extractedTarget = false;
  let writingTarget = false;
  let totalExtractedBytes = 0;
  let outHandle: fs.FileHandle | undefined;

  const source = createReadStream(archiveFile);
  const gunzip = createGunzip();
  source.on('error', error => gunzip.destroy(error));
  source.pipe(gunzip);
  const onAbort = () => {
    source.destroy();
    gunzip.destroy();
  };
  signal.addEventListener('abort', onAbort, { once: true });

  const invalid = (message = 'Google AI 代理程序安装包格式无效或包含不安全内容，已取消安装。') =>
    new ModelAccessError('model_google_ai_archive_invalid', message, 502);

  try {
    try {
      for await (const rawChunk of gunzip) {
        signal.throwIfAborted();
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
        let offset = 0;

        while (offset < chunk.length) {
          if (state === 'header') {
            const take = Math.min(TAR_BLOCK_SIZE - headerFilled, chunk.length - offset);
            chunk.copy(headerBuf, headerFilled, offset, offset + take);
            offset += take;
            headerFilled += take;
            if (headerFilled < TAR_BLOCK_SIZE) break;
            headerFilled = 0;

            if (isAllZero(headerBuf)) {
              zeroBlocks++;
              if (zeroBlocks >= 2) state = 'eof';
              continue;
            }
            if (zeroBlocks > 0) throw invalid();

            memberCount++;
            if (memberCount > maxMembers) throw invalid('Google AI 代理程序安装包成员数超出上限，已取消安装。');
            if (!verifyTarChecksum(headerBuf)) throw invalid();

            const magic = headerBuf.subarray(257, 262).toString('ascii');
            const magicNext = headerBuf[262];
            if (magic !== 'ustar' || (magicNext !== 0x00 && magicNext !== 0x20)) throw invalid();

            const typeflag = headerBuf[156];
            if (typeflag !== 0x00 && typeflag !== 0x30) throw invalid();
            if (!isAllZero(headerBuf.subarray(157, 257))) throw invalid();

            let name: string;
            let prefix = '';
            try {
              name = readNullTerminatedUtf8(headerBuf.subarray(0, 100));
              if (magicNext === 0x00) prefix = readNullTerminatedUtf8(headerBuf.subarray(345, 500));
            } catch {
              throw invalid();
            }

            const combinedPath = prefix ? `${prefix}/${name}` : name;
            const normalizedPath = normalizeMemberPath(combinedPath);
            if (!normalizedPath) throw invalid();

            const size = parseOctalField(headerBuf.subarray(124, 136));
            if (size === undefined) throw invalid();
            if (size > maxExtractedBytes) {
              throw new ModelAccessError('model_google_ai_archive_too_large', 'Google AI 代理程序解压体积超出上限，已取消安装。', 502);
            }

            const isTarget = normalizedPath === expectedMember;
            if (isTarget) {
              if (extractedTarget) throw invalid();
              await privateDirectories(path.dirname(resolvedOut));
              outHandle = await fs.open(resolvedOut, 'wx', 0o700);
              extractedTarget = true;
              writingTarget = true;
            } else {
              writingTarget = false;
            }

            remainingPayload = size;
            remainingPadding = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
            if (remainingPayload > 0) {
              state = 'payload';
            } else {
              if (outHandle) {
                await outHandle.close();
                outHandle = undefined;
              }
              writingTarget = false;
              state = remainingPadding > 0 ? 'padding' : 'header';
            }
            continue;
          }

          if (state === 'payload') {
            const take = Math.min(remainingPayload, chunk.length - offset);
            totalExtractedBytes += take;
            if (totalExtractedBytes > maxExtractedBytes) {
              throw new ModelAccessError('model_google_ai_archive_too_large', 'Google AI 代理程序解压体积超出上限，已取消安装。', 502);
            }
            if (writingTarget && outHandle) {
              await writeAll(outHandle, chunk.subarray(offset, offset + take));
            }
            offset += take;
            remainingPayload -= take;
            if (remainingPayload === 0) {
              if (outHandle) {
                await outHandle.close();
                outHandle = undefined;
              }
              writingTarget = false;
              state = remainingPadding > 0 ? 'padding' : 'header';
            }
            continue;
          }

          if (state === 'padding') {
            const take = Math.min(remainingPadding, chunk.length - offset);
            offset += take;
            remainingPadding -= take;
            if (remainingPadding === 0) state = 'header';
            continue;
          }

          const slice = chunk.subarray(offset);
          if (!isAllZero(slice)) throw invalid();
          trailingZeroBytes += slice.length;
          if (trailingZeroBytes > MAX_TRAILING_ZERO_BYTES) {
            throw new ModelAccessError('model_google_ai_archive_too_large', 'Google AI 代理程序归档尾部填充超出上限，已取消安装。', 502);
          }
          offset = chunk.length;
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ModelAccessError) throw error;
      throw invalid('Google AI 代理程序安装包已损坏或被截断，已取消安装。');
    }

    signal.throwIfAborted();
    if (state !== 'eof' || headerFilled !== 0 || trailingZeroBytes % TAR_BLOCK_SIZE !== 0 || !extractedTarget) {
      throw invalid('Google AI 代理程序安装包不完整或缺少目标程序，已取消安装。');
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    source.destroy();
    gunzip.destroy();
    await outHandle?.close().catch(() => {});
  }
}

/** Extract one named regular-file member from a `.zip` archive in-process with path, symlink, size, and CRC-32 checks. */
export async function extractZipNamedMember(
  archiveFile: string,
  stagingRoot: string,
  expectedMemberRaw: string,
  outputFile: string,
  signal: AbortSignal,
  limits: CliProxyInstallLimits = {},
): Promise<void> {
  const expectedMember = normalizeMemberPath(expectedMemberRaw);
  if (!expectedMember) {
    throw new ModelAccessError('model_google_ai_archive_invalid', 'Google AI 代理程序声明的归档成员路径无效。', 502);
  }
  const resolvedOut = assertSafeOutputTarget(stagingRoot, outputFile);
  const maxExtractedBytes = limits.maxExtractedBytes ?? DEFAULT_MAX_EXTRACTED_BYTES;
  const maxMembers = limits.maxMembers ?? DEFAULT_MAX_ARCHIVE_MEMBERS;
  const invalid = (message = 'Google AI 代理程序 ZIP 安装包格式无效或包含不安全内容，已取消安装。') =>
    new ModelAccessError('model_google_ai_archive_invalid', message, 502);

  const handle = await fs.open(archiveFile, 'r');
  let outHandle: fs.FileHandle | undefined;
  try {
    const fileStat = await handle.stat();
    const fileSize = fileStat.size;
    if (fileSize < 22) throw invalid();

    const tailLen = Math.min(fileSize, 65_557);
    const tailOffset = fileSize - tailLen;
    const tail = Buffer.allocUnsafe(tailLen);
    await handle.read(tail, 0, tailLen, tailOffset);

    let eocdInTail = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        const commentLength = tail.readUInt16LE(i + 20);
        if (i + 22 + commentLength === tailLen) {
          eocdInTail = i;
          break;
        }
      }
    }
    if (eocdInTail < 0) throw invalid();

    const diskNumber = tail.readUInt16LE(eocdInTail + 4);
    const cdDisk = tail.readUInt16LE(eocdInTail + 6);
    const entriesOnDisk = tail.readUInt16LE(eocdInTail + 8);
    const totalEntries = tail.readUInt16LE(eocdInTail + 10);
    const cdSize = tail.readUInt32LE(eocdInTail + 12);
    const cdOffset = tail.readUInt32LE(eocdInTail + 16);
    const eocdOffset = tailOffset + eocdInTail;

    if (
      diskNumber !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries ||
      totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff ||
      cdOffset + cdSize > eocdOffset || totalEntries > maxMembers
    ) {
      throw invalid();
    }

    const cd = Buffer.allocUnsafe(cdSize);
    await handle.read(cd, 0, cdSize, cdOffset);

    let cursor = 0;
    let totalUncompressed = 0;
    let target: {
      method: number;
      crc: number;
      compressedSize: number;
      uncompressedSize: number;
      localHeaderOffset: number;
    } | undefined;

    for (let index = 0; index < totalEntries; index++) {
      signal.throwIfAborted();
      if (cursor + 46 > cd.length || cd.readUInt32LE(cursor) !== 0x02014b50) throw invalid();
      const flags = cd.readUInt16LE(cursor + 8);
      const method = cd.readUInt16LE(cursor + 10);
      const expectedCrc = cd.readUInt32LE(cursor + 16);
      const compressedSize = cd.readUInt32LE(cursor + 20);
      const uncompressedSize = cd.readUInt32LE(cursor + 24);
      const nameLen = cd.readUInt16LE(cursor + 28);
      const extraLen = cd.readUInt16LE(cursor + 30);
      const commentLen = cd.readUInt16LE(cursor + 32);
      const externalAttr = cd.readUInt32LE(cursor + 38);
      const localHeaderOffset = cd.readUInt32LE(cursor + 42);
      if (cursor + 46 + nameLen + extraLen + commentLen > cd.length) throw invalid();

      if ((flags & 0x0001) !== 0) throw invalid();
      const posixMode = (externalAttr >>> 16) & 0o170000;
      if (posixMode === 0o120000) throw invalid();
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw invalid();
      totalUncompressed += uncompressedSize;
      if (uncompressedSize > maxExtractedBytes || totalUncompressed > maxExtractedBytes) {
        throw new ModelAccessError('model_google_ai_archive_too_large', 'Google AI 代理程序解压体积超出上限，已取消安装。', 502);
      }

      const rawName = cd.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
      const normalized = normalizeMemberPath(rawName);
      if (!normalized) throw invalid();

      if (normalized === expectedMember) {
        if (target) throw invalid();
        if (method !== 0 && method !== 8) throw invalid();
        if (posixMode !== 0 && posixMode !== 0o100000) throw invalid();
        target = { method, crc: expectedCrc, compressedSize, uncompressedSize, localHeaderOffset };
      }
      cursor += 46 + nameLen + extraLen + commentLen;
    }
    if (cursor !== cd.length || !target) throw invalid('Google AI 代理程序 ZIP 安装包缺少目标程序，已取消安装。');

    if (target.localHeaderOffset + 30 > cdOffset) throw invalid();
    const localHeader = Buffer.allocUnsafe(30);
    await handle.read(localHeader, 0, 30, target.localHeaderOffset);
    if (localHeader.readUInt32LE(0) !== 0x04034b50) throw invalid();
    const localNameLen = localHeader.readUInt16LE(26);
    const localExtraLen = localHeader.readUInt16LE(28);
    const dataOffset = target.localHeaderOffset + 30 + localNameLen + localExtraLen;
    if (dataOffset + target.compressedSize > cdOffset) throw invalid();

    await privateDirectories(path.dirname(resolvedOut));
    outHandle = await fs.open(resolvedOut, 'wx', 0o700);
    let written = 0;
    let runningCrc = 0;

    if (target.method === 0) {
      if (target.compressedSize !== target.uncompressedSize) throw invalid();
      const buf = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(1, target.compressedSize)));
      let remaining = target.compressedSize;
      let pos = dataOffset;
      while (remaining > 0) {
        signal.throwIfAborted();
        const readLen = Math.min(buf.length, remaining);
        const res = await handle.read(buf, 0, readLen, pos);
        if (res.bytesRead <= 0) throw invalid();
        const slice = buf.subarray(0, res.bytesRead);
        runningCrc = crc32(slice, runningCrc);
        await writeAll(outHandle, slice);
        written += res.bytesRead;
        pos += res.bytesRead;
        remaining -= res.bytesRead;
      }
    } else {
      const compressedStream = createReadStream(archiveFile, {
        start: dataOffset,
        end: target.compressedSize > 0 ? dataOffset + target.compressedSize - 1 : dataOffset - 1,
      });
      const inflate = createInflateRaw();
      compressedStream.on('error', error => inflate.destroy(error));
      if (target.compressedSize === 0) {
        compressedStream.destroy();
        inflate.end();
      } else {
        compressedStream.pipe(inflate);
      }
      const onAbort = () => {
        compressedStream.destroy();
        inflate.destroy();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        for await (const rawChunk of inflate) {
          signal.throwIfAborted();
          const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
          written += chunk.length;
          if (written > target.uncompressedSize || written > maxExtractedBytes) {
            throw new ModelAccessError('model_google_ai_archive_too_large', 'Google AI 代理程序解压体积超出上限，已取消安装。', 502);
          }
          runningCrc = crc32(chunk, runningCrc);
          await writeAll(outHandle, chunk);
        }
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof ModelAccessError) throw error;
        throw invalid('Google AI 代理程序 ZIP 数据损坏，已取消安装。');
      } finally {
        signal.removeEventListener('abort', onAbort);
        compressedStream.destroy();
        inflate.destroy();
      }
    }

    if (written !== target.uncompressedSize || (runningCrc >>> 0) !== (target.crc >>> 0)) {
      throw invalid('Google AI 代理程序 ZIP 完整性校验未通过，已取消安装。');
    }
  } finally {
    await outHandle?.close().catch(() => {});
    await handle.close().catch(() => {});
  }
}

async function allocateLoopbackPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string' || !Number.isInteger(address.port) || address.port < 1024 || address.port > 65535) {
      throw new ModelAccessError('model_google_ai_port_unavailable', '无法分配本地代理端口，请重试。', 503);
    }
    return address.port;
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function cleanupOrphanStaging(directory: string): Promise<void> {
  const entries = await fs.readdir(directory).catch(() => []);
  await Promise.all(
    entries
      .filter(name => name.startsWith('.prepare-'))
      .map(name => fs.rm(path.join(directory, name), { recursive: true, force: true }).catch(() => {})),
  );
}

async function ensureConfigAndAuth(directory: string): Promise<void> {
  const authDir = path.join(directory, 'auth');
  await privateDirectories(directory, authDir);

  const configPath = path.join(directory, 'config.yaml');
  try {
    const info = await fs.lstat(configPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ModelAccessError('model_google_ai_config_unsafe', 'Google AI 代理配置文件路径不安全。', 409);
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const mgmtKeyPath = path.join(directory, 'quota-management.key');
  let mgmtKey: string | undefined;
  try {
    const info = await fs.lstat(mgmtKeyPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ModelAccessError('model_google_ai_config_unsafe', 'Google AI 额度密钥路径不安全。', 409);
    }
    const existing = (await fs.readFile(mgmtKeyPath, 'utf8')).trim();
    if (existing) mgmtKey = existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!mgmtKey) {
    mgmtKey = randomBytes(32).toString('hex');
    try {
      await fs.writeFile(mgmtKeyPath, mgmtKey + '\n', { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const info = await fs.lstat(mgmtKeyPath);
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new ModelAccessError('model_google_ai_config_unsafe', 'Google AI 额度密钥路径不安全。', 409);
      }
      mgmtKey = (await fs.readFile(mgmtKeyPath, 'utf8')).trim() || mgmtKey;
    }
  }

  const port = await allocateLoopbackPort();
  const apiKey = randomBytes(32).toString('hex');
  const payload = {
    'config-version': 8,
    server: { host: '127.0.0.1', port },
    access: { 'api-keys': [apiKey] },
    oauth: {
      'auth-dir': authDir,
      providers: { antigravity: { 'antigravity-credits': false } },
    },
    management: {
      'disable-control-panel': true,
      'secret-key': mgmtKey,
    },
  };

  try {
    await fs.writeFile(configPath, JSON.stringify(payload) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const info = await fs.lstat(configPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ModelAccessError('model_google_ai_config_unsafe', 'Google AI 代理配置文件路径不安全。', 409);
    }
  }
}

async function hasValidBinary(binaryPath: string): Promise<boolean> {
  try {
    const info = await fs.lstat(binaryPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ModelAccessError('model_google_ai_binary_unsafe', 'Google AI 代理程序路径不安全。', 409);
    }
    return info.size > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Ensure `<directory>/cli-proxy-api(.exe)` and `<directory>/config.yaml` exist, reusing any existing installation untouched. */
export async function ensureCliProxyInstalled(directory: string, options: EnsureCliProxyOptions = {}): Promise<{ binaryPath: string; configPath: string; downloaded: boolean }> {
  const signal = options.signal ?? new AbortController().signal;
  signal.throwIfAborted();

  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const binaryPath = path.join(directory, cliProxyBinaryName(platform));
  const configPath = path.join(directory, 'config.yaml');

  await privateDirectories(directory);
  await cleanupOrphanStaging(directory);

  let downloaded = false;
  if (!(await hasValidBinary(binaryPath))) {
    const asset = resolveCliProxyAsset(platform, arch, options.releases ?? CLIPROXY_RELEASES);
    const baseUrl = options.releaseBaseUrl ?? CLIPROXY_RELEASE_BASE_URL;
    const allowedHosts = options.allowedHosts ?? CLIPROXY_ALLOWED_HOSTS;
    const downloadUrl = new URL(asset.filename, baseUrl).toString();

    const stagingDir = path.join(directory, `.prepare-${randomUUID()}`);
    await privateDirectories(stagingDir);
    try {
      const archiveFile = path.join(stagingDir, asset.filename);
      const stagedBinary = path.join(stagingDir, asset.member);
      await downloadAndVerifySha256(downloadUrl, asset.sha256, allowedHosts, archiveFile, signal, {
        fetchImpl: options.fetch,
        maxDownloadBytes: options.limits?.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES,
      });
      if (asset.archiveKind === 'tar.gz') {
        await extractTarGzNamedMember(archiveFile, stagingDir, asset.member, stagedBinary, signal, options.limits);
      } else {
        await extractZipNamedMember(archiveFile, stagingDir, asset.member, stagedBinary, signal, options.limits);
      }
      signal.throwIfAborted();
      await finalizeManifestExecutable(stagedBinary, platform);
      if (!(await hasValidBinary(binaryPath))) {
        await fs.rename(stagedBinary, binaryPath);
        downloaded = true;
      }
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  await ensureConfigAndAuth(directory);
  return { binaryPath, configPath, downloaded };
}
