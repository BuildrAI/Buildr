import process from 'node:process';

export async function runCli(argv = process.argv) {
  const { isLightweightTaskFinishCommand, runLightweightTaskFinish } = await import('./task-finish-bootstrap.mjs');
  if (isLightweightTaskFinishCommand(argv)) return runLightweightTaskFinish(argv);
  if (process.env.BUILDR_TEST_FAIL_FULL_BOOTSTRAP === '1') throw new Error('Injected full runtime bootstrap failure.');
  const { dispatch } = await import('./registry.mjs');
  return dispatch(argv);
}

export function reportCliFailure(error, argv = process.argv) {
  const structuredInputError = typeof error.code === 'string' && (error.code.startsWith('task_finish.') || error.code.startsWith('task_record_cli.') || typeof error.usage === 'string');
  if (argv.includes('--json') && structuredInputError) {
    console.log(JSON.stringify({
      schemaVersion: 'buildr.cli-error/v1',
      error: { code: error.code, message: error.message },
      suggestions: error.nextAction ? [error.nextAction] : [],
      help: error.usage || 'buildr --help',
    }, null, 2));
  } else {
    console.error(process.env.BUILDR_DEBUG_STACK === '1' && error.stack ? error.stack : `${error.code ? `[${error.code}] ` : ''}${error.message}`);
    if (error.usage) console.error(`Usage: ${error.usage}`);
    if (error.nextAction) console.error(`Next: ${error.nextAction}`);
  }
  process.exit(structuredInputError ? 2 : 1);
}
