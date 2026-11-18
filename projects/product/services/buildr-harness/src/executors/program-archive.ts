import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createGunzip } from 'node:zlib';
import { fail } from '../domain/agent-state.ts';
import { privateDirectories } from './native-process.ts';
import type { ProgramDistribution } from './program-policy.ts';
import { fetchCheckedHttps, type ManifestRelease } from './program-release.ts';

const execFileAsync = promisify(execFile);

export const MAX_ARCHIVE_DOWNLOAD_BYTES = 512 * 1024 * 1024;
export const MAX_ARCHIVE_EXTRACTED_BYTES = 1024 * 1024 * 1024;
export const MAX_TAR_MEMBERS = 16;
const MAX_TRAILING_ZERO_BYTES = 64 * 1024;
const TAR_BLOCK_SIZE = 512;

export interface ManifestInstallLimits {
  maxDownloadBytes?: number;
  maxExtractedBytes?: number;
  maxTarMembers?: number;
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
      fail('agent_install_failed', '写入程序文件失败，未完成准备。');
    }
    written += result.bytesWritten;
  }
}

/** Stream-download an official manifest payload while enforcing redirect allowlist, byte limit, and SHA-512 digest. */
export async function downloadManifestPayload(
  manifest: ManifestRelease,
  distribution: Extract<ProgramDistribution, { kind: 'manifest' }>,
  destinationFile: string,
  signal: AbortSignal,
  options: { fetchImpl?: typeof fetch; limits?: ManifestInstallLimits } = {},
): Promise<void> {
  const maxDownloadBytes = options.limits?.maxDownloadBytes ?? MAX_ARCHIVE_DOWNLOAD_BYTES;
  const { response } = await fetchCheckedHttps(
    manifest.url,
    distribution.archiveAllowedHosts,
    AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)]),
    {
      fetchImpl: options.fetchImpl,
      maxRedirects: 5,
      errorPrefix: 'agent_install',
    },
  );

  const hash = createHash('sha512');
  const reader = response.body!.getReader();
  let downloaded = 0;
  const handle = await fs.open(destinationFile, 'wx', 0o600);
  try {
    while (true) {
      signal.throwIfAborted();
      const step = await reader.read();
      if (step.done) break;
      downloaded += step.value.byteLength;
      if (downloaded > maxDownloadBytes) {
        fail('agent_install_archive_too_large', '下载归档超过大小上限，已中止准备。');
      }
      hash.update(step.value);
      await writeAll(handle, step.value);
    }
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    await handle.close().catch(() => {});
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  signal.throwIfAborted();
  const actualDigest = hash.digest('hex');
  if (actualDigest !== manifest.sha512.toLowerCase()) {
    await fs.rm(destinationFile, { force: true });
    fail('agent_install_digest_mismatch', '下载产物的完整性摘要校验未通过，未启用该程序。');
  }
}

/** Extract exactly one declared regular-file member from a `.tar.gz` archive in-process.
 * Rejects links, devices, extended headers, path traversal, extra/duplicate/missing members, truncation, and zip bombs. */
export async function extractTarGzSingleMember(
  archiveFile: string,
  stagingRoot: string,
  expectedMemberRaw: string,
  outputFile: string,
  signal: AbortSignal,
  limits: ManifestInstallLimits = {},
): Promise<void> {
  const expectedMember = normalizeMemberPath(expectedMemberRaw);
  if (!expectedMember) {
    fail('agent_install_archive_invalid', '程序策略声明的归档成员路径无效。');
  }
  const resolvedRoot = path.resolve(stagingRoot);
  const resolvedOut = path.resolve(outputFile);
  const relOut = path.relative(resolvedRoot, resolvedOut);
  if (!relOut || relOut === '..' || relOut.startsWith('..' + path.sep) || path.isAbsolute(relOut)) {
    fail('agent_install_archive_unsafe', '解压输出路径超出受管临时目录。');
  }

  const maxExtractedBytes = limits.maxExtractedBytes ?? MAX_ARCHIVE_EXTRACTED_BYTES;
  const maxMembers = limits.maxTarMembers ?? MAX_TAR_MEMBERS;

  const headerBuf = Buffer.alloc(TAR_BLOCK_SIZE);
  let headerFilled = 0;
  let state: 'header' | 'payload' | 'padding' | 'eof' = 'header';
  let remainingPayload = 0;
  let remainingPadding = 0;
  let zeroBlocks = 0;
  let trailingZeroBytes = 0;
  let memberCount = 0;
  let extractedMember = false;
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
            if (zeroBlocks > 0) {
              fail('agent_install_archive_corrupt', '程序归档结束块不连续，已拒绝解压。');
            }

            memberCount++;
            if (memberCount > maxMembers) {
              fail('agent_install_archive_invalid', '程序归档成员数超出上限，已拒绝解压。');
            }
            if (!verifyTarChecksum(headerBuf)) {
              fail('agent_install_archive_corrupt', '程序归档头部校验未通过，已拒绝解压。');
            }

            const magic = headerBuf.subarray(257, 262).toString('ascii');
            const magicNext = headerBuf[262];
            if (magic !== 'ustar' || (magicNext !== 0x00 && magicNext !== 0x20)) {
              fail('agent_install_archive_invalid', '程序归档不是受支持的 ustar/GNU 格式，已拒绝解压。');
            }

            const typeflag = headerBuf[156];
            if (typeflag !== 0x00 && typeflag !== 0x30) {
              fail('agent_install_archive_unsafe', '程序归档包含链接、目录或特殊文件，已拒绝解压。');
            }
            if (!isAllZero(headerBuf.subarray(157, 257))) {
              fail('agent_install_archive_unsafe', '程序归档普通成员携带异常链接目标，已拒绝解压。');
            }

            let name: string;
            let prefix = '';
            try {
              name = readNullTerminatedUtf8(headerBuf.subarray(0, 100));
              if (magicNext === 0x00) {
                prefix = readNullTerminatedUtf8(headerBuf.subarray(345, 500));
              }
            } catch {
              fail('agent_install_archive_invalid', '程序归档成员名称编码无效，已拒绝解压。');
            }

            const combinedPath = prefix ? `${prefix}/${name}` : name;
            const normalizedPath = normalizeMemberPath(combinedPath);
            if (!normalizedPath) {
              fail('agent_install_archive_unsafe', '程序归档包含越界或非法路径，已拒绝解压。');
            }
            if (normalizedPath !== expectedMember) {
              fail('agent_install_archive_invalid', '程序归档包含未声明的多余成员，已拒绝解压。');
            }
            if (extractedMember) {
              fail('agent_install_archive_invalid', '程序归档包含重复成员，已拒绝解压。');
            }

            const size = parseOctalField(headerBuf.subarray(124, 136));
            if (size === undefined) {
              fail('agent_install_archive_corrupt', '程序归档成员大小字段无效，已拒绝解压。');
            }
            if (size > maxExtractedBytes) {
              fail('agent_install_archive_too_large', '解压目标超出大小上限，已拒绝解压。');
            }

            await privateDirectories(path.dirname(resolvedOut));
            outHandle = await fs.open(resolvedOut, 'wx', 0o700);
            extractedMember = true;
            remainingPayload = size;
            remainingPadding = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
            if (remainingPayload > 0) {
              state = 'payload';
            } else {
              await outHandle.close();
              outHandle = undefined;
              state = remainingPadding > 0 ? 'padding' : 'header';
            }
            continue;
          }

          if (state === 'payload') {
            const take = Math.min(remainingPayload, chunk.length - offset);
            totalExtractedBytes += take;
            if (totalExtractedBytes > maxExtractedBytes) {
              fail('agent_install_archive_too_large', '解压目标超出大小上限，已拒绝解压。');
            }
            await writeAll(outHandle!, chunk.subarray(offset, offset + take));
            offset += take;
            remainingPayload -= take;
            if (remainingPayload === 0) {
              await outHandle!.close();
              outHandle = undefined;
              state = remainingPadding > 0 ? 'padding' : 'header';
            }
            continue;
          }

          if (state === 'padding') {
            const take = Math.min(remainingPadding, chunk.length - offset);
            offset += take;
            remainingPadding -= take;
            if (remainingPadding === 0) {
              state = 'header';
            }
            continue;
          }

          // state === 'eof': allow only bounded zero padding after the two EOF zero blocks.
          const slice = chunk.subarray(offset);
          if (!isAllZero(slice)) {
            fail('agent_install_archive_invalid', '程序归档结束块后仍包含非零数据，已拒绝解压。');
          }
          trailingZeroBytes += slice.length;
          if (trailingZeroBytes > MAX_TRAILING_ZERO_BYTES) {
            fail('agent_install_archive_too_large', '程序归档尾部填充超出上限，已拒绝解压。');
          }
          offset = chunk.length;
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string' && String((error as { code: string }).code).startsWith('agent_install_')) {
        throw error;
      }
      fail('agent_install_archive_corrupt', '程序归档已损坏或被截断，未启用该程序。');
    }

    signal.throwIfAborted();
    if (state !== 'eof' || headerFilled !== 0 || trailingZeroBytes % TAR_BLOCK_SIZE !== 0) {
      fail('agent_install_archive_corrupt', '程序归档不完整或被截断，未启用该程序。');
    }
    if (!extractedMember) {
      fail('agent_install_archive_invalid', '程序归档缺少声明的程序成员，未启用该程序。');
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    source.destroy();
    gunzip.destroy();
    await outHandle?.close().catch(() => {});
  }
}

/** Finalize executable mode and best-effort quarantine removal on macOS. */
export async function finalizeManifestExecutable(
  executableFile: string,
  platform: NodeJS.Platform = process.platform,
  onDiagnostic?: (code: string) => void,
): Promise<void> {
  await fs.chmod(executableFile, 0o755);
  if (platform === 'darwin') {
    try {
      await execFileAsync('/usr/bin/xattr', ['-d', 'com.apple.quarantine', executableFile], { timeout: 5_000 });
    } catch {
      onDiagnostic?.('macos_quarantine_clear_skipped');
    }
  }
}
