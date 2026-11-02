import type { ExecutionFault, ExecutorEvent } from '../contracts.ts';

/** Adapter compatibility mapping only; recovery always requires independent native proof. */
export function executionFault(diagnostic?: string): ExecutionFault | undefined {
  if (!diagnostic) return undefined;
  if (/malformed tool call stream|orphan_tool_call_delta|tool_call_stream_(?:invalid|incomplete)/i.test(diagnostic)) return {kind:'protocol'};
  if (/^(?:codex|dsh|qoder)_(?:execution|event)_observation_lost$/.test(diagnostic)) return {kind:'transport'};
  if (/^agent_native_process_(?:closed|failed)$/.test(diagnostic)) return {kind:'process'};
  return undefined;
}
export function withExecutionFault(event: ExecutorEvent): ExecutorEvent {
  if (event.type === 'completed' && event.status === 'failed') return {...event,fault:event.fault??executionFault(event.diagnostic)};
  if (event.type === 'observation') return {...event,observation:{...event.observation,fault:event.observation.fault??executionFault(event.observation.diagnostic)}};
  return event;
}
