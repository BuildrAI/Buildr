import { CheckCircleFilled, ExclamationCircleFilled, InfoCircleOutlined } from '@ant-design/icons';
import type { HookResult } from '../connection-skill-types';
import { diagnosticText } from '../connection-skill-form';

export function ConnectionHookResult({ result, stale, saved, personal = false }: { result?: HookResult; stale: boolean; saved: boolean; personal?: boolean }) {
  if (!result) return null;
  const success = result.status === 'success' && !stale;
  const label = stale ? '上次测试 · 输入已变化' : result?.status === 'success' ? '本次只读测试通过' : result?.status === 'failure' ? '本次测试失败' : '本次测试结果未知';
  const error = result?.status === 'failure' ? result.diagnostics.map(diagnosticText).find(Boolean) : '';
  return <div className="buildr-connection-skill-result" aria-live="polite">
    {(stale || !result || result.status !== 'success') && <small className="buildr-connection-skill-muted" id={personal ? 'connection-skill-personal-verification-state' : 'connection-skill-verification-state'}>{saved ? '已保存，未验证' : '当前草稿未验证'}</small>}
    {result && <details id={personal ? 'connection-skill-personal-test-result' : 'connection-skill-test-result'} className={`buildr-connection-test-details is-${stale ? 'stale' : result.status}`}><summary>{success ? <CheckCircleFilled /> : result.status === 'failure' && !stale ? <ExclamationCircleFilled /> : <InfoCircleOutlined />}<span>{label} · {result.authenticationSource === 'personal' ? '个人账号' : '团队账号'}{error && ` · ${error}`}</span><small>详情</small></summary>
      <div><time dateTime={result.observedAt}>{new Date(result.observedAt).toLocaleString()}</time>{[...result.checks, ...result.diagnostics, ...result.limitations, ...(result.warnings || [])].map((item, index) => <p key={index}>{diagnosticText(item)}</p>)}</div>
    </details>}
  </div>;
}
