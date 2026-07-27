import process from 'node:process';

export async function runCli(argv = process.argv) {
  const { isLightweightTaskFinishCommand, runLightweightTaskFinish } = await import('./task-finish-bootstrap.mjs');
  if (isLightweightTaskFinishCommand(argv)) return runLightweightTaskFinish(argv);
  if (process.env.BUILDR_TEST_FAIL_FULL_BOOTSTRAP === '1') throw new Error('Injected full runtime bootstrap failure.');
  const { dispatch } = await import('./registry.mjs');
  return dispatch(argv);
}
