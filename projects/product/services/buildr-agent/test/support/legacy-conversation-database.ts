import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StoredConversation } from '../../src/domain/agent-state.ts';
import { summaryView, messageSignature } from '../../src/domain/conversation-activity.ts';
import { ConversationReadModel } from '../../src/persistence/conversation-read-model.ts';

/** The on-disk v4 contract, not a second implementation of migration. */
export function writeLegacyConversationDatabase(filename: string, records: StoredConversation[], projections = false): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  try {
    db.exec(`CREATE TABLE connections(id TEXT PRIMARY KEY,provider TEXT NOT NULL UNIQUE,revision TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE conversations(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,task_id TEXT,hidden INTEGER NOT NULL,updated_at TEXT NOT NULL,revision TEXT NOT NULL,body TEXT NOT NULL,
        summary TEXT,message_signature TEXT,activity_at TEXT NOT NULL DEFAULT '',activity_version INTEGER NOT NULL DEFAULT 0,seen_version INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 0,user_at TEXT NOT NULL DEFAULT '');
      CREATE TABLE conversation_epoch(id INTEGER PRIMARY KEY,value INTEGER NOT NULL);INSERT INTO conversation_epoch VALUES(1,0);
      PRAGMA user_version=4;`);
    for (const record of records) {
      db.prepare('INSERT INTO conversations(id,workspace_id,hidden,updated_at,revision,body,summary,message_signature,activity_at,user_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(record.view.id, record.view.workspaceId, Number(record.view.hidden), record.view.updatedAt, record.view.revision, JSON.stringify(record),
          JSON.stringify(summaryView(record, 0, 0, record.view.updatedAt)), messageSignature(record), record.view.updatedAt, record.view.updatedAt);
    }
    if (projections) {
      ConversationReadModel.install(db);
      for (const record of records) { ConversationReadModel.saveHeader(db, record); ConversationReadModel.saveEntries(db, record); }
    }
  } finally { db.close(); }
}
