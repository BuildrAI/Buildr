import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createGeneratedReleaseInputs } from './generated-release-inputs.ts';
import { buildApplicationPayload } from '../../../../../../skills/buildr-release/scripts/application-payload.ts';
import { createReleaseArtifact } from '../../../../../../skills/buildr-release/scripts/release-artifact.ts';

// Real package bytes with the small, declared Web/Test Context fixture. Full
// React and clean-checkout packaging are exercised by the hosted Candidate.
export async function createReleaseArtifactFixture(root: string, sourceCommit: string): Promise<any> {
  const generated = createGeneratedReleaseInputs(path.join(root, 'generated'), sourceCommit);
  const payload = await buildApplicationPayload(path.join(root, 'payload'), sourceCommit, {
    generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot,
  });
  return createReleaseArtifact(payload.root, path.join(root, 'package'), { testContextRoot: generated.testContextRoot });
}

/** Existing canonical record owners, isolated from the release/Git owner under test. */
export function preparationRecordFixture(workspace: string, taskId: string): any {
  const digest = (bytes: string) => `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  let documents: any[] = [], materialsDigest = 'absent', report: any = null, reportDigest = 'absent';
  const calls: string[][] = [];
  let failure: { stage: string; after: boolean } | null = null;
  return { calls, fail(stage: string, after = false) { failure = { stage, after }; },
    invoke(args: string[]) {
      if (args[0] !== 'task' || !['materials', 'verification'].includes(args[1])) return null;
      calls.push(args);
      const stage = `${args[1]}-${args[2]}`;
      const injected = failure?.stage === stage ? failure : null;
      if (injected) failure = null;
      if (injected && !injected.after) return { status: 'blocked', diagnostic: { message: `injected ${stage}` } };
      const value = (name: string) => args[args.indexOf(name) + 1];
      let result: any;
      if (args[1] === 'materials') {
        if (args[2] === 'write') {
          const file = path.join(workspace, '.buildr/local/task-materials', taskId, value('--path'));
          fs.mkdirSync(path.dirname(file), { recursive: true });
          if (value('--expected-document') !== 'absent' || fs.existsSync(file)) throw new Error('Fixture document CAS failed.');
          fs.copyFileSync(value('--content'), file);
          result = { actualDigest: digest(fs.readFileSync(file, 'utf8')) };
        } else {
          if (args[2] === 'record') {
            if (value('--expected-current') !== materialsDigest) throw new Error('Fixture materials CAS failed.');
            documents = JSON.parse(fs.readFileSync(value('--materials'), 'utf8')).documents;
            materialsDigest = digest(JSON.stringify(documents));
          }
          result = { materialsDigest, materials: { schemaVersion: 'buildr.task-materials/v2', documents }, documents };
        }
      } else {
        if (args[2] === 'record') {
          if (value('--expected-report') !== reportDigest) throw new Error('Fixture report CAS failed.');
          const input = JSON.parse(fs.readFileSync(value('--report'), 'utf8'));
          report = { ...input, content: { identity: input.contentIdentity, summary: input.contentSummary } };
          reportDigest = digest(JSON.stringify(report));
        }
        result = { status: args[2] === 'record' ? 'recorded' : 'inspected',
          slot: { present: Boolean(report), reportDigest: report ? reportDigest : null, report } };
      }
      return injected?.after ? { status: 'blocked', diagnostic: { message: `lost ${stage} response` } } : result;
    },
  };
}
