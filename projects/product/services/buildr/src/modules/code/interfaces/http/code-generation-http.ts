import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';
import { AGENT_OPERATIONS_HTTP_SCHEMAS } from '../../../agent-operations/interfaces/http/agent-operations-http-contracts.ts';
import type { CodeCommitMessageApplication, CodeCommitMessageInput } from '../../application/code-commit-message-application.ts';
import { codeFailure } from '../../infrastructure/code-file-reader.ts';

const request = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.buildr.ai/http/code-generation/CodeCommitMessageRequest', title: 'CodeCommitMessageRequest',
  type: 'object', additionalProperties: false,
  properties: { repositoryId: { type: 'string', minLength: 1 }, worktreeId: { type: 'string', pattern: '^checkout-[a-f0-9]{64}$' }, expectedRevision: { type: 'string', minLength: 1, maxLength: 200 }, agentId: { type: 'string', minLength: 1, maxLength: 200 } },
  required: ['repositoryId', 'worktreeId', 'expectedRevision'],
};
export const CODE_GENERATION_HTTP_SCHEMAS = Object.freeze({
  run: { ...AGENT_OPERATIONS_HTTP_SCHEMAS.run, $id: 'https://schemas.buildr.ai/http/code-generation/CodeCommitMessageRun', title: 'CodeCommitMessageRun' },
});
const validators = compileJsonSchemaCatalog([request, CODE_GENERATION_HTTP_SCHEMAS.run]);
export const CODE_GENERATION_HTTP_OPERATIONS = Object.freeze([{
  id: 'code.commitMessage', owner: 'code', method: 'POST', path: '/code/commit-message', disposition: 'migrated-json', responseKind: 'json',
  requestSchemaId: request.$id, successSchemaId: CODE_GENERATION_HTTP_SCHEMAS.run.$id, errorSchemaId: 'https://schemas.buildr.ai/http/local-app/error/response/v1',
}]);
type HttpInput = { request: { method?: string }; suffix: string; searchParams: URLSearchParams; root: string; authorizeWrite?: () => void; readJsonBody?: () => Promise<unknown> };
export function createCodeGenerationHttpContribution(application: CodeCommitMessageApplication) {
  return Object.freeze({
    id: 'code.generation.http', schemas: { ...CODE_GENERATION_HTTP_SCHEMAS, request }, operations: CODE_GENERATION_HTTP_OPERATIONS,
    async handle({ request: incoming, suffix, searchParams, root, authorizeWrite, readJsonBody }: HttpInput) {
      if (incoming.method !== 'POST' || suffix !== '/code/commit-message') return null;
      if (!authorizeWrite || !readJsonBody) throw codeFailure('code_generation_unauthorized', '生成请求缺少本机会话（Session）授权。', 403);
      authorizeWrite();
      if (searchParams.size) throw codeFailure('code_query_invalid', '生成接口不接受查询参数。');
      const input = await readJsonBody();
      if (!validators.validate(request.$id, input).valid) throw codeFailure('code_generation_invalid', '生成请求不符合契约。');
      const body = await application.generateCommitMessage(root, input as CodeCommitMessageInput);
      if (!validators.validate(CODE_GENERATION_HTTP_SCHEMAS.run.$id, body).valid) throw codeFailure('code_response_invalid', '生成结果不符合契约。', 500);
      return { status: 202, body };
    },
  });
}
