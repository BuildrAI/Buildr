import type { SourceControlFetchResult } from '../hooks/useSourceControlFetch';
import type { SourceControlRepository } from '../source-control-model';

export const sourceControlFetchStatus = {succeeded:'已获取', failed:'失败', unavailable:'不可用', unknown:'结果未知'};

export function SourceControlFetchResults({repositories, results}: {repositories:SourceControlRepository[]; results:Record<string, SourceControlFetchResult>}) {
  const entries = repositories.flatMap(repository => results[repository.id] ? [{repository, result:results[repository.id]}] : []);
  if (!entries.length) return null;
  return <details className="source-control-fetch-results" open>
    <summary>获取远程：{entries.filter(({result}) => result.status === 'succeeded').length} 成功 / {entries.length} 个代码库</summary>
    <ul>{entries.map(({repository, result}) => <li key={repository.id} data-fetch-repository={repository.id} data-fetch-status={result.status}>
      <strong>{repository.name}</strong><span>{sourceControlFetchStatus[result.status]}</span><p>{result.message}</p>
      {result.remotes.some(remote => remote.status !== 'succeeded') && <ul>{result.remotes.filter(remote => remote.status !== 'succeeded').map(remote => <li key={remote.name}>{remote.name}：{sourceControlFetchStatus[remote.status]} · {remote.message}</li>)}</ul>}
    </li>)}</ul>
  </details>;
}
