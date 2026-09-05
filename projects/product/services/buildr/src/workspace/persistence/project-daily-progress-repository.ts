import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import {
  dailyProgressError,
  isDailyProgressDate,
  isLegacyDailyProgressDocument,
  normalizeDailyProgressDocument,
} from '../domain/project-daily-progress.ts';

export type ProjectDailyProgressRepositoryRuntime = {
  existsFile(file: string): boolean;
  existsDirectory(directory: string): boolean;
  parseYamlDocument(content: string, label: string): any;
  atomicWriteFile(file: string, content: string): void;
};

function dailyProgressRoot(targetRoot: any) {
  return path.join(targetRoot, '.buildr', 'daily-progress');
}

function dailyProgressFile(targetRoot: any, project: any, date: any) {
  return path.join(dailyProgressRoot(targetRoot), project, `${date}.yml`);
}

function serializeDocument(document: any) {
  return YAML.stringify({
    schemaVersion: document.schemaVersion,
    project: document.project,
    date: document.date,
    recordedAt: document.recordedAt,
    daySummary: document.daySummary,
    commits: document.commits.map((commit: any) => ({
      sha: commit.sha,
      subject: commit.subject,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      authorship: commit.authorship,
      taskIds: commit.taskIds,
    })),
    files: document.files,
  }, { lineWidth: 0 });
}

export function createProjectDailyProgressRepository(runtime: ProjectDailyProgressRepositoryRuntime) {
  function readDailyProgressDocument(targetRoot: any, project: any, date: any) {
    const file = dailyProgressFile(targetRoot, project, date);
    if (!runtime.existsFile(file)) return { present: false, incompatible: false, document: null };
    let raw;
    try {
      raw = runtime.parseYamlDocument(fs.readFileSync(file, 'utf8'), `每日演进 ${project}/${date}`);
    } catch (error: any) {
      throw dailyProgressError('daily_progress_document_invalid', `每日演进文件无法解析：${error.message}`, 409, { project, date });
    }
    if (isLegacyDailyProgressDocument(raw)) {
      return { present: true, incompatible: true, document: null };
    }
    return {
      present: true,
      incompatible: false,
      document: normalizeDailyProgressDocument(raw, { project, date }),
    };
  }

  function writeDailyProgressDocument(targetRoot: any, document: any) {
    const normalized = normalizeDailyProgressDocument(document);
    runtime.atomicWriteFile(dailyProgressFile(targetRoot, normalized.project, normalized.date), serializeDocument(normalized));
    return { present: true, incompatible: false, document: normalized };
  }

  function listDailyProgressDates(targetRoot: any, project: any) {
    const directory = path.join(dailyProgressRoot(targetRoot), project);
    if (!runtime.existsDirectory(directory)) return [];
    return fs.readdirSync(directory)
      .filter((name: any) => name.endsWith('.yml'))
      .map((name: any) => name.slice(0, -4))
      .filter((date: any) => isDailyProgressDate(date))
      .sort()
      .reverse();
  }

  function listDailyProgressDocuments(targetRoot: any) {
    const root = dailyProgressRoot(targetRoot);
    if (!runtime.existsDirectory(root)) return [];
    const documents: any[] = [];
    for (const project of fs.readdirSync(root).sort()) {
      const directory = path.join(root, project);
      if (!runtime.existsDirectory(directory)) continue;
      for (const date of listDailyProgressDates(targetRoot, project)) {
        const read = readDailyProgressDocument(targetRoot, project, date);
        if (read.present && read.document) documents.push(read.document);
      }
    }
    return documents;
  }

  return Object.freeze({
    readDailyProgressDocument,
    writeDailyProgressDocument,
    listDailyProgressDates,
    listDailyProgressDocuments,
  });
}

export type DailyProgressRepository = ReturnType<typeof createProjectDailyProgressRepository>;
