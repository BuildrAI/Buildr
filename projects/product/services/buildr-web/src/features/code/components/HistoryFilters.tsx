import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Button, Input, Popover, Tooltip } from 'antd';
import { CheckOutlined, DownOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { SourceControlBranchPicker } from './SourceControlBranchPicker';
import type { SourceControlBranch } from '../source-control-branches';
import type { SourceControlWorktree } from '../source-control-model';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import './history-filters.css';

export type HistoryFiltersProps = {
  authors: Array<{name: string; email: string}>;
  currentAuthor: {name: string; email: string} | null;
  authorsLoading: boolean;
  worktree: SourceControlWorktree;
  entries: SourceControlBranch[];
  branchRef: string;
  authorEmail: string;
  remoteLoading: boolean;
  remoteUpdatedAt: string;
  remoteError: string;
  query: string;
  onBranchChange(ref: string): void;
  onAuthorChange(email: string): void;
  onClear(): void;
  onRefreshRemote(): void;
};

type AuthorOption = { value: string; label: string; name: string; email: string; search: string; duplicateName: boolean };

export function HistoryFilters({ authors: observedAuthors, currentAuthor, authorsLoading, worktree, entries, branchRef, authorEmail, remoteLoading, remoteUpdatedAt, remoteError, query, onBranchChange, onAuthorChange, onClear, onRefreshRemote }: HistoryFiltersProps) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const authorTriggerRef = useRef<ComponentRef<typeof Button>>(null);
  const [authorOpen, setAuthorOpen] = useState(false);
  const [authorSearch, setAuthorSearch] = useState('');
  useEffect(() => { if (!viewActive) setAuthorOpen(false); }, [viewActive]);
  useEffect(() => { if (!authorOpen) setAuthorSearch(''); }, [authorOpen]);
  const authors = useMemo(() => {
    const byEmail = new Map<string, string>();
    observedAuthors.forEach(author => {
      if (author.email && !byEmail.has(author.email)) byEmail.set(author.email, author.name || author.email);
    });
    if (authorEmail && !byEmail.has(authorEmail)) byEmail.set(authorEmail, authorEmail);
    const nameCounts = new Map<string, number>();
    byEmail.forEach(name => nameCounts.set(name, (nameCounts.get(name) || 0) + 1));
    const options: AuthorOption[] = [{ value: '', label: '作者：全部', name: '全部作者', email: '', search: '全部作者', duplicateName: false }];
    byEmail.forEach((name, email) => options.push({ value: email, label: email === currentAuthor?.email ? '作者：我（me）' : `作者：${name}`, name, email, search: `${name} ${email}`, duplicateName: (nameCounts.get(name) || 0) > 1 }));
    return options;
  }, [observedAuthors, authorEmail, currentAuthor]);
  const authorOptions = useMemo(() => {
    const search = authorSearch.trim().toLocaleLowerCase();
    return search ? authors.filter(author => author.email && author.search.toLocaleLowerCase().includes(search)) : authors;
  }, [authors, authorSearch]);
  const branchName = branchRef === 'HEAD' ? '当前' : entries.find(entry => entry.ref === branchRef)?.name || branchRef.replace(/^refs\/(heads|remotes)\//, '');
  const active = branchRef !== 'HEAD' || Boolean(authorEmail) || Boolean(query.trim());
  const selectedAuthor = authors.find(author => author.value === authorEmail);
  const authorTitle = selectedAuthor?.email ? `${selectedAuthor.name} · ${selectedAuthor.email}` : '作者：全部';
  const closeAuthors = () => { setAuthorOpen(false); authorTriggerRef.current?.focus(); };
  const chooseAuthor = (email: string) => { onAuthorChange(email); closeAuthors(); };
  const authorPanel = <section className="branch-history-author-popup" aria-label="提交作者" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeAuthors(); } }}>
    <div className="branch-history-author-search"><Input size="small" autoFocus allowClear value={authorSearch} onChange={event => setAuthorSearch(event.target.value)} prefix={<SearchOutlined />} placeholder="输入作者姓名或邮箱" aria-label="输入作者姓名或邮箱" /></div>
    <Button type="text" className="branch-history-author-me" disabled={authorsLoading || !currentAuthor} title={authorsLoading ? '正在读取作者身份' : currentAuthor?.email || '当前位置没有可确认的 Git 作者邮箱'} aria-label="筛选我的提交（me）" onClick={() => { if (currentAuthor) chooseAuthor(currentAuthor.email); }}>
      <span className="branch-history-author-option"><span>我的提交（me）</span><small>{authorsLoading ? '正在读取作者身份…' : currentAuthor?.email || 'Git 作者邮箱不可用'}</small></span>{currentAuthor?.email === authorEmail && <CheckOutlined />}
    </Button>
    <div className="branch-history-author-menu" role="listbox" aria-label="作者列表">
      {authorOptions.length ? authorOptions.map(author => <Button key={author.value} type="text" role="option" aria-selected={author.value === authorEmail} aria-label={`筛选作者 ${author.name}${author.email ? ' · ' + author.email : ''}`} title={author.email ? `${author.name} · ${author.email}` : author.name} data-author-email={author.email} className="branch-history-author-item" onClick={() => chooseAuthor(author.value)}>
        <span className="branch-history-author-option"><span>{author.name}</span>{author.duplicateName && <small>{author.email}</small>}</span>{author.value === authorEmail && <CheckOutlined />}
      </Button>) : <p className="branch-history-author-empty">没有匹配的作者</p>}
    </div>
  </section>;

  return <div className="branch-history-filters" data-prototype-position="history-filter-controls" role="group" aria-label="提交历史筛选">
    <div className="branch-history-filter-branch" title={`分支：${branchName}`}>
      <SourceControlBranchPicker entries={entries} value={branchRef} currentBranch={worktree.branch} currentHead={worktree.head} remoteLoading={remoteLoading} remoteUpdatedAt={remoteUpdatedAt} remoteError={remoteError} onChange={onBranchChange} onRefreshRemote={onRefreshRemote} label={`分支：${branchName}`} separateCurrentScope />
    </div>
    <Popover open={viewActive && authorOpen} onOpenChange={nextOpen => setAuthorOpen(viewActive && nextOpen)} trigger="click" placement="bottomLeft" content={authorPanel} overlayClassName="branch-history-author-popover" destroyOnHidden>
      <Button ref={authorTriggerRef} className="branch-history-filter-author" size="small" aria-label="筛选提交作者" aria-expanded={viewActive && authorOpen} aria-haspopup="dialog" title={authorTitle}><span>{selectedAuthor?.label || '作者：全部'}</span><DownOutlined /></Button>
    </Popover>
    <Tooltip title="重置关键词、分支和作者"><span className="branch-history-filter-reset"><Button size="small" type="text" className="branch-history-filter-clear" icon={<ReloadOutlined />} disabled={!active} aria-label="重置筛选条件" onClick={onClear}>重置</Button></span></Tooltip>
  </div>;
}
