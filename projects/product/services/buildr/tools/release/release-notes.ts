#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';

const releaseVersionPattern: any = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function escapeRegExp(value: any): any  {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractReleaseNotes(changelog: any, version: any): any  {
  if (!releaseVersionPattern.test(version)) throw new Error(`Unsupported release version: ${version}`);

  const content: any = String(changelog).replace(/\r\n/g, '\n');
  const expectedHeading: any = `## ${version} - <YYYY-MM-DD>`;
  const headingPattern: any = new RegExp(`^##\\s+${escapeRegExp(version)}\\s+-\\s+\\d{4}-\\d{2}-\\d{2}\\s*$`, 'gm');
  const matches: any[] = [...content.matchAll(headingPattern)];

  if (matches.length === 0) {
    throw new Error(`CHANGELOG is missing release section ${expectedHeading}.`);
  }
  if (matches.length > 1) {
    throw new Error(`CHANGELOG contains duplicate release sections for ${version}.`);
  }

  const [match]: any = matches;
  const start: any = match.index;
  const bodyStart: any = start + match[0].length;
  const nextHeading: any = /^##\s+/gm;
  nextHeading.lastIndex = bodyStart;
  const nextMatch: any = nextHeading.exec(content);
  const end: any = nextMatch?.index ?? content.length;
  const body: any = content.slice(bodyStart, end).trim();
  const meaningfulBody: any = body.replace(/<!--[\s\S]*?-->/g, '').trim();

  if (!meaningfulBody) {
    throw new Error(`CHANGELOG release section for ${version} has no content.`);
  }

  return `${match[0].trimEnd()}\n\n${body}\n`;
}

export function readReleaseNotes(version: any, changelogPath: any): any  {
  const resolvedPath: any = path.resolve(changelogPath);
  let changelog: any;
  try {
    changelog = fs.readFileSync(resolvedPath, 'utf8');
  } catch (error: any) {
    throw new Error(`Unable to read changelog at ${resolvedPath}: ${error.message}`);
  }
  return extractReleaseNotes(changelog, version);
}

function main(): any  {
  const version: any = process.argv[2];
  const changelogPath: any = process.argv[3];
  if (!version || !changelogPath) {
    throw new Error('Usage: release-notes.ts <version> <changelog-path>');
  }
  process.stdout.write(readReleaseNotes(version, changelogPath));
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error: any) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
