import { Button, Checkbox, Empty, Select } from 'antd';
import { BranchesOutlined, CheckCircleOutlined, CloudOutlined, DownOutlined, FolderOpenOutlined, RightOutlined } from '@ant-design/icons';
import { ChangedFileList, changedFileKey, type ChangedFileEntry } from '../../task/components/TaskChangedFiles';
import { sourceControlFileKey, sourceControlVisibleWorktrees, sourceControlWorktreeKey, type SourceControlChange, type SourceControlRepository, type SourceControlWorktree } from '../source-control-model';

export const areaLabels = { unstaged: '未暂存', staged: '已暂存', untracked: '未跟踪' };
export const layerFile = (file: SourceControlChange, version?: string): ChangedFileEntry => ({ ...file, repositoryId: JSON.stringify([file.repositoryId, file.worktreeId || '', version || file.area]) });
export const worktreeLabel = (worktree: SourceControlWorktree) => worktree.isMain ? '主工作树' : worktree.name;
type FoldProps = { expanded: Record<string, boolean>; onToggle(key: string, defaultExpanded?: boolean): void };
const open = (expanded: Record<string, boolean>, key: string, defaultExpanded = true) => expanded[key] ?? defaultExpanded;
function Fold({label, name, identity, expanded, onToggle, defaultExpanded = true}: FoldProps & {label: string; name: string; identity: string; defaultExpanded?: boolean}) {
  const isOpen = open(expanded, identity, defaultExpanded);
  return <button type="button" className="source-control-fold" aria-label={(isOpen ? '折叠' : '展开') + label + ' ' + name} aria-expanded={isOpen} onClick={() => onToggle(identity, defaultExpanded)}>{isOpen ? <DownOutlined /> : <RightOutlined />}</button>;
}
const count = (value: number | null | undefined) => value === 0 ? <CheckCircleOutlined /> : value ?? '—';
const sync = (worktree: SourceControlWorktree) => worktree.status === 'offline' ? <><CloudOutlined /> 不可读取</> : <>{worktree.ahead ? '↑' + worktree.ahead : ''}{worktree.behind ? ' ↓' + worktree.behind : ''}{worktree.ahead === null || worktree.behind === null ? '上游未知' : !worktree.ahead && !worktree.behind ? '已同步' : ''}</>;

type TreeProps = FoldProps & {
  repositories: SourceControlRepository[]; scope: string[]; names: string[]; ready: boolean;
  selectedWorktreeKey: string; onScope(ids: string[]): void; onNames(names: string[]): void;
  onReset(): void; onPick(repository: SourceControlRepository, worktree: SourceControlWorktree): void;
};
export function SourceControlRepositoryTree({repositories, scope, names, ready, selectedWorktreeKey, onScope, onNames, onReset, onPick, ...fold}: TreeProps) {
  const selectedIds = scope.length ? scope : repositories.map(repository => repository.id);
  const nameOptions = [...new Set(repositories.flatMap(repository => repository.worktrees.map(worktree => worktree.name)))].sort();
  return <section className="source-control-repositories" data-prototype-position="repositories">
    <div className="source-control-tree-controls">
    <div className="source-control-section-title"><strong>代码库 <span>{ready ? repositories.length : '…'}</span></strong><Button type="link" size="small" onClick={onReset}>全部</Button></div>
    <div className="source-control-worktree-filter"><Select mode="multiple" allowClear maxTagCount={1} size="small" aria-label="筛选工作树名称" placeholder="全部工作树" value={names} options={nameOptions.map(name => ({value: name, label: name}))} onChange={onNames} /></div>
    </div><div className="source-control-repository-tree-scroll" aria-label="代码库与工作树列表">
    {repositories.map(repository => <section key={repository.id} data-source-repository={repository.id}>
      <div className={'source-control-repository' + (scope.includes(repository.id) ? ' is-scoped' : '')}>
        <Fold {...fold} identity={'catalog-repo:' + repository.id} label="代码库" name={repository.name} />
        <Checkbox aria-label={'筛选代码库 ' + repository.name} checked={selectedIds.includes(repository.id)} onChange={event => {
          const next = event.target.checked ? [...new Set([...selectedIds, repository.id])] : selectedIds.filter(id => id !== repository.id);
          onScope(next.length === repositories.length ? [] : next.length ? next : [repository.id]);
        }} />
        <button type="button" className="source-control-repository-copy" title={repository.location} onClick={() => onScope([repository.id])}><span><FolderOpenOutlined /><strong>{repository.name}</strong>{repository.simulated && <small>模拟</small>}</span><span className="source-control-repository-meta">{repository.worktreeCount === null ? '工作树数量未知' : (repository.worktreeCount ?? repository.worktrees.length) + ' 个工作树'}</span></button>
        <span className="source-control-repository-count" title="各工作树未提交文件数合计">{count(repository.fileCount)}</span>
      </div>
      <div hidden={!open(fold.expanded, 'catalog-repo:' + repository.id)} className="source-control-worktree-children">
        {repository.worktrees.map(worktree => <div key={worktree.worktreeId} data-source-worktree={worktree.worktreeId}>
          <div className={'source-control-worktree' + (selectedWorktreeKey === sourceControlWorktreeKey(repository.id, worktree.worktreeId) ? ' is-selected' : '')}>
            <Fold {...fold} identity={'catalog-wt:' + sourceControlWorktreeKey(repository.id, worktree.worktreeId)} label="工作树" name={worktreeLabel(worktree)} defaultExpanded={false} />
            <button type="button" className="source-control-repository-copy" onClick={() => onPick(repository, worktree)} title={worktree.location} aria-label={'查看工作树 ' + worktreeLabel(worktree) + ' · ' + repository.name}>
              <span><strong>{worktreeLabel(worktree)}</strong>{worktree.isRegistered && <small>登记</small>}</span><span className="source-control-repository-meta"><code><BranchesOutlined /> {worktree.branch || worktree.head?.slice(0, 8) || '—'}</code><span>{sync(worktree)}</span></span>
            </button><span className="source-control-repository-count" title="未提交文件数">{count(worktree.fileCount)}</span>
          </div>
          <div className="source-control-worktree-details" hidden={!open(fold.expanded, 'catalog-wt:' + sourceControlWorktreeKey(repository.id, worktree.worktreeId), false)}><code title={worktree.location}>{worktree.location}</code>{worktree.diagnostics.length > 0 && <small>{worktree.diagnostics.join('；')}</small>}</div>
        </div>)}
      </div>
    </section>)}
    {!repositories.length && <p className="source-control-catalog-note">{ready ? '尚未登记代码库。' : '正在读取代码库…'}</p>}
    </div>
  </section>;
}

type ChangesProps = FoldProps & { repositories: SourceControlRepository[]; names: string[]; exact: string[]; selectedKey: string | null; onPick(key: string): void; onRetry(id: string): void };
export function SourceControlChanges({repositories, names, exact, selectedKey, onPick, onRetry, ...fold}: ChangesProps) {
  const visible = repositories.map(repository => ({repository, worktrees: sourceControlVisibleWorktrees(repository, names, exact)})).filter(item => item.worktrees.length || item.repository.worktreeCount === null);
  return <>{!visible.length && <div className="source-control-list-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选没有工作树" /></div>}{visible.map(({repository, worktrees}) => <section className="source-control-change-group" key={repository.id} data-change-repository={repository.id}>
    <button type="button" className="source-control-change-heading" aria-label={(open(fold.expanded, 'change-repo:' + repository.id) ? '折叠' : '展开') + '变更代码库 ' + repository.name} aria-expanded={open(fold.expanded, 'change-repo:' + repository.id)} onClick={() => fold.onToggle('change-repo:' + repository.id)}>{open(fold.expanded, 'change-repo:' + repository.id) ? <DownOutlined /> : <RightOutlined />}<strong>{repository.name}</strong><span>{repository.worktreeCount === null ? worktrees.length ? '已读 ' + worktrees.length + ' 个工作树 · 总数未知' : '数量未知' : worktrees.length + ' 个工作树'}</span></button>
    <div hidden={!open(fold.expanded, 'change-repo:' + repository.id)}>{repository.worktreeCount === null && !worktrees.length && <div className="source-control-local-failure"><p>工作树清单尚未确认，无法判断当前筛选是否匹配。</p>{repository.diagnostics?.length ? <p>{repository.diagnostics.join('；')}</p> : null}<Button type="link" size="small" onClick={() => onRetry(repository.id)}>重新读取</Button></div>}{worktrees.map(worktree => {
      const identity = sourceControlWorktreeKey(repository.id, worktree.worktreeId), group = 'change-wt:' + identity;
      return <section className="source-control-change-worktree" key={identity} data-change-worktree={worktree.worktreeId}>
        <button type="button" className="source-control-change-heading" aria-label={(open(fold.expanded, group) ? '折叠' : '展开') + '变更工作树 ' + worktreeLabel(worktree)} aria-expanded={open(fold.expanded, group)} onClick={() => fold.onToggle(group)}>{open(fold.expanded, group) ? <DownOutlined /> : <RightOutlined />}<strong>{worktreeLabel(worktree)}</strong><code>{worktree.branch || '—'}</code><span>{worktree.fileCount ?? '未知'}</span></button>
        <div hidden={!open(fold.expanded, group)}>{worktree.status === 'offline' ? <div className="source-control-local-failure"><p>目录暂不可读取，变更数量尚未确认。</p><Button type="link" size="small" onClick={() => onRetry(repository.id)}>重新读取</Button></div> : !worktree.changes.length ? <p className="source-control-clean">{worktree.status === 'partial' || worktree.fileCount !== 0 ? '文件列表未完整读取，无法确认全部变更。' : <><CheckCircleOutlined /> 工作树干净</>}</p> : (Object.keys(areaLabels) as Array<keyof typeof areaLabels>).map(area => {
          const changes = worktree.changes.filter(file => file.area === area), areaKey = 'area:' + identity + ':' + area;
          return changes.length ? <div className="source-control-change-area" data-change-area={area} key={area}>
            <button type="button" className="source-control-area-heading" data-area-toggle={area} aria-label={(open(fold.expanded, areaKey) ? '折叠' : '展开') + areaLabels[area] + ' ' + worktreeLabel(worktree)} aria-expanded={open(fold.expanded, areaKey)} onClick={() => fold.onToggle(areaKey)}>{open(fold.expanded, areaKey) ? <DownOutlined /> : <RightOutlined />}{areaLabels[area]}<span>{changes.length}</span></button>
            <div hidden={!open(fold.expanded, areaKey)}><ChangedFileList compact selectable files={changes.map(file => layerFile(file))} expanded={null} selectedKey={selectedKey} onExpand={key => { const file = changes.find(entry => changedFileKey(layerFile(entry)) === key); if (file) onPick(sourceControlFileKey(file)); }} /></div>
          </div> : null;
        })}</div>
      </section>;
    })}</div>
  </section>)}<p className="source-control-list-note">按实际工作树分别读取。同名筛选只匹配名称。</p></>;
}
