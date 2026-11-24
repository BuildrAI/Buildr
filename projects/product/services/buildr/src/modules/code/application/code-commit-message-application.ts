import {
  createCodeCommitMessageApplication as createHarnessCommitMessageApplication,
  COMMIT_MESSAGE_PROMPT,
  COMMIT_MESSAGE_PROMPT_LIMIT_BYTES,
  type CodeCommitMessageInput,
  type CodeCommitMessageDependencies,
  type CodeCommitMessageApplication,
} from '@buildr-ai/buildr-harness/workbench';
import { parseTaskCommitTrailer } from '../../task/commits/domain/task-commit.ts';

export { COMMIT_MESSAGE_PROMPT, COMMIT_MESSAGE_PROMPT_LIMIT_BYTES };
export type { CodeCommitMessageInput, CodeCommitMessageDependencies, CodeCommitMessageApplication };

export function createCodeCommitMessageApplication(dependencies: CodeCommitMessageDependencies) {
  return createHarnessCommitMessageApplication({
    ...dependencies,
    parseTaskTrailer: dependencies.parseTaskTrailer ?? parseTaskCommitTrailer,
  });
}
