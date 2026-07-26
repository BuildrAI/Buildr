#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function rehearseArchive({ projectRoot, change, openspecCommand = 'openspec', owner = `pid-${process.pid}`, io = fs, runCommand = spawnSync }) {
  const sourceRoot = path.resolve(projectRoot, 'openspec');
  const changeRoot = path.join(sourceRoot, 'changes', change);
  if (!io.existsSync(changeRoot)) throw new Error(`active Change not found: ${changeRoot}`);
  if (!io.existsSync(path.join(changeRoot, 'specs'))) {
    return { schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: 'not-applicable', change, owner, reason: 'change-has-no-delta-specs', cleanupStatus: 'not-applicable' };
  }
  if (!path.isAbsolute(openspecCommand) || !io.existsSync(openspecCommand)) {
    return {
      schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: 'failed', change, owner,
      error: 'OpenSpec executable 必须在复制 planning root 前解析为存在的绝对路径。',
      nextAction: '解析当前 Project 的 OpenSpec executable 绝对路径后重试 rehearsal。', cleanupStatus: 'not-applicable',
    };
  }

  const temporaryRoot = io.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-archive-rehearsal-'));
  const isolatedProject = path.join(temporaryRoot, 'project');
  let result = { schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: 'failed', change, owner, temporaryRoot };
  try {
    io.mkdirSync(isolatedProject, { recursive: true });
    io.cpSync(sourceRoot, path.join(isolatedProject, 'openspec'), { recursive: true, errorOnExist: true });
    const version = runCommand(openspecCommand, ['--version'], { encoding: 'utf8' });
    const archive = runCommand(openspecCommand, ['archive', change, '--yes'], { cwd: isolatedProject, encoding: 'utf8' });
    result = {
      schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: archive.status === 0 ? 'passed' : 'failed', change, owner,
      openspecVersion: version.status === 0 ? version.stdout.trim() : 'unknown', exitCode: archive.status,
      stdout: archive.stdout.trim(), stderr: archive.stderr.trim(), temporaryRoot,
    };
  } finally {
    try {
      io.rmSync(temporaryRoot, { recursive: true, force: true });
      result.cleanupStatus = 'cleaned';
    } catch (error) {
      result.cleanupStatus = 'retained';
      result.cleanupError = error.message;
    }
  }
  return result;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) values[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  if (!values['project-root'] || !values.change) throw new Error('usage: archive-rehearsal.mjs --project-root <path> --change <id> --openspec <absolute-path> [--owner <id>]');
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = rehearseArchive({ projectRoot: args['project-root'], change: args.change, openspecCommand: args.openspec, owner: args.owner });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'failed' || result.cleanupStatus === 'retained') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ schemaVersion: 'buildr.openspec-archive-rehearsal/v1', status: 'failed', error: error.message }, null, 2));
    process.exitCode = 1;
  }
}
