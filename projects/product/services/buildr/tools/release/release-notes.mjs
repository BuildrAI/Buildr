#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

const releaseVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractReleaseNotes(changelog, version) {
  if (!releaseVersionPattern.test(version)) throw new Error(`Unsupported release version: ${version}`);

  const content = String(changelog).replace(/\r\n/g, '\n');
  const expectedHeading = `## ${version} - <YYYY-MM-DD>`;
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(version)}\\s+-\\s+\\d{4}-\\d{2}-\\d{2}\\s*$`, 'gm');
  const matches = [...content.matchAll(headingPattern)];

  if (matches.length === 0) {
    throw new Error(`CHANGELOG is missing release section ${expectedHeading}.`);
  }
  if (matches.length > 1) {
    throw new Error(`CHANGELOG contains duplicate release sections for ${version}.`);
  }

  const [match] = matches;
  const start = match.index;
  const bodyStart = start + match[0].length;
  const nextHeading = /^##\s+/gm;
  nextHeading.lastIndex = bodyStart;
  const nextMatch = nextHeading.exec(content);
  const end = nextMatch?.index ?? content.length;
  const body = content.slice(bodyStart, end).trim();
  const meaningfulBody = body.replace(/<!--[\s\S]*?-->/g, '').trim();

  if (!meaningfulBody) {
    throw new Error(`CHANGELOG release section for ${version} has no content.`);
  }

  return `${match[0].trimEnd()}\n\n${body}\n`;
}

export function readReleaseNotes(version, changelogPath) {
  const resolvedPath = path.resolve(changelogPath);
  let changelog;
  try {
    changelog = fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read changelog at ${resolvedPath}: ${error.message}`);
  }
  return extractReleaseNotes(changelog, version);
}

function main() {
  const version = process.argv[2];
  const changelogPath = process.argv[3];
  if (!version || !changelogPath) {
    throw new Error('Usage: release-notes.mjs <version> <changelog-path>');
  }
  process.stdout.write(readReleaseNotes(version, changelogPath));
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
