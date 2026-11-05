export type IndependentScenario<T> = { id: string; name: string; run(fixture: T): Promise<void> };
export type ScenarioResult = { id: string; name: string; status: 'passed' | 'failed' | 'not-run'; durationMs: number; failure?: {kind: string; location?: string} };

/** One member source; unknown selections fail before any browser is created. */
export function selectIndependentScenarios<T extends {id:string;name:string}>(scenarios: readonly T[], selection = '') {
  const ids = new Set(scenarios.map(item => item.id));
  if (ids.size !== scenarios.length) throw new Error('重复场景身份');
  const terms = selection.split('|').map(value => value.trim()).filter(Boolean);
  for (const term of terms) if (!scenarios.some(item => item.id === term || item.name.includes(term))) throw new Error('未知独立场景：' + term);
  return scenarios.filter(item => !terms.length || terms.some(term => item.id === term || item.name.includes(term)));
}

export async function runIndependentScenarios<T>(scenarios: readonly IndependentScenario<T>[], options: {
  create(scenario: IndependentScenario<T>): Promise<T>;
  dispose(fixture: T): Promise<void>;
  afterScenario?(): Promise<void>;
  record(result: ScenarioResult): void;
}) {
  const failures: unknown[] = [];
  let clean = true;
  for (const scenario of scenarios) {
    const started = performance.now();
    if (!clean) { options.record({id: scenario.id, name: scenario.name, status: 'not-run', durationMs: 0}); continue; }
    let fixture: T | undefined;
    let passed = true;
    let failure: ScenarioResult['failure'];
    const describe=(error:unknown)=>{
      const e=error as {name?:string;stack?:string};
      const location=String(e?.stack??'').replaceAll(String.fromCharCode(92),'/').match(new RegExp("test/[^()\n]+[.](?:ts|tsx|js|mjs):[0-9]+:[0-9]+"))?.[0];
      return {kind:/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(e?.name??'')?e.name!:'Error',...(location?{location}:{})};
    };
    try { fixture = await options.create(scenario); await scenario.run(fixture); }
    catch (error) { passed = false; failure=describe(error); failures.push(new Error(scenario.id, {cause: error})); }
    finally {
      try { if (fixture) await options.dispose(fixture); await options.afterScenario?.(); }
      catch (error) { clean = false; passed = false; failure??=describe(error); failures.push(new Error('场景清理失败：' + scenario.id, {cause: error})); }
      options.record({id: scenario.id, name: scenario.name, status: passed ? 'passed' : 'failed', durationMs: Math.round(performance.now() - started),...(failure?{failure}:{})});
    }
  }
  if (failures.length) throw new AggregateError(failures, '独立浏览器场景包含失败');
}
