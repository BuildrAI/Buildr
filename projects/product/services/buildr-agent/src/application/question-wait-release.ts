import type { AgentRuntime, ContextRef, ExecutionRef, ExecutorObservation } from '../contracts.ts';

export type QuestionWaitReleaseInput = { contextRef: ContextRef; executionRef: ExecutionRef; requestIds: string[] };

/** The service owns policy; adapters may provide a stronger native primitive.
 * Generic cancellation is safe only for a proven question-only wait, never for
 * a running model, an approval, an unknown tool or independent background work. */
export async function releaseQuestionWait(
  runtime: AgentRuntime, input: QuestionWaitReleaseInput,
  beforeEffect: () => void,
): Promise<ExecutorObservation | undefined> {
  const observation = await runtime.observe(input);
  if (observation.executionRef?.id !== input.executionRef.id || !(observation.status === 'waiting' || runtime.endQuestionWait && observation.status === 'running') ||
      observation.backgroundWork || observation.tools.some(tool => tool.status !== 'completed') ||
      !observation.requests?.length || observation.requests.some(request =>
        request.kind !== 'question' || !input.requestIds.includes(request.id))) return;
  beforeEffect();
  if (runtime.endQuestionWait) return runtime.endQuestionWait(input);
  return runtime.stop(input);
}
