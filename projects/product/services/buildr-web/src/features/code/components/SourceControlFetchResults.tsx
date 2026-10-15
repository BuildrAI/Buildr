import type { SourceControlFetchResult } from '../hooks/useSourceControlFetch';
import type { SourceControlRepository } from '../source-control-model';

export const sourceControlFetchStatus = {succeeded:'已获取', failed:'失败', unavailable:'不可用', unknown:'结果未知'};

export function SourceControlFetchResults({repositories, results}: {repositories:SourceControlRepository[]; results:Record<string, SourceControlFetchResult>}) {
  const entries = Object.values(results).map(result => ({repository: repositories.find(repository => repository.id === result.repositoryId), result}));
  if (!entries.length) return null;
  return <div className="source-control-fetch-results">
    <ul>{entries.map(({repository, result}) => <li key={result.repositoryId} data-fetch-repository={result.repositoryId} data-fetch-status={result.status}>
      <strong>{repository?.name || result.repositoryId}</strong><span>{sourceControlFetchStatus[result.status]}</span><p>{result.message}</p>
      {result.remotes.some(remote => remote.status !== 'succeeded') && <ul>{result.remotes.filter(remote => remote.status !== 'succeeded').map(remote => <li key={remote.name}>{remote.name}：{sourceControlFetchStatus[remote.status]} · {remote.message}</li>)}</ul>}
    </li>)}</ul>
  </div>;
}
