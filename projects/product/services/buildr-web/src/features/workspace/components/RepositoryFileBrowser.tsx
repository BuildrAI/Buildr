import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Alert, App, Button, Empty, Input, Modal, Segmented, Space, Spin, Tag, Tooltip, Tree } from 'antd';
import { CopyOutlined, DownOutlined, FileImageOutlined, FileTextOutlined, FolderOpenOutlined, FolderOutlined, MenuFoldOutlined, MenuUnfoldOutlined, ReloadOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import { MarkdownHost } from '../../../components/MarkdownHost';
import type { MarkdownRenderOptions } from '../../../markdown';
import { RepositorySearchText } from './RepositorySearchText';
import { repositorySearchQuery } from './repository-search-query';
import { repositorySourceLines, visibleRepositoryMatch, type RepositoryFilePage } from './repository-file-page';
export type { RepositoryFilePage } from './repository-file-page';
import './repository-file-browser.css';

export type RepositoryPreviewFile = {
  path: string;
  content: string;
  kind: 'text' | 'markdown' | 'image' | 'unsupported';
  status?: 'M' | 'U';
  ignored?: boolean;
  image?: string;
  directory?: boolean;
  link?: boolean;
};

export type RepositoryTreeScope = { id: string; repositoryId?: string; name: string; location?: string; files: RepositoryPreviewFile[] };
type TreeFile = RepositoryPreviewFile & { repositoryId?: string; sourceRepositoryId?: string; repositoryName?: string };
type SearchResult = RepositoryPreviewFile & {repositoryId?:string;sourceRepositoryId?:string;repositoryName?:string;line?:number;excerpt?:string;occurrences?:Array<{line:number;excerpt:string}>};
function treeKey(path: string, repositoryId?: string) { return repositoryId ? repositoryId + '::' + path : path; }

type Props = {
  files: RepositoryPreviewFile[];
  treeRepositories?: RepositoryTreeScope[];
  selectedRepositoryId?: string;
  repositoryName?: string;
  onSelectRepositoryFile?(repositoryId: string, path: string, line?: number, matchQuery?: string): void;
  selectedPath: string;
  onSelect(path: string, line?: number, matchQuery?: string): void;
  context: ReactNode;
  location: string;
  version: string;
  historical?: boolean;
  focusLine?: number;
  focusRequest?: number;
  unavailable?: boolean;
  resetKey?: number;
  searchSeed?: string;
  onRetry(): void | Promise<void>;
  onViewCurrent(): void;
  onChanges?(path: string): void;
  onScene?(state: string): void;
  sidebarHost?: HTMLElement | null;
  global?: boolean;
  readerActive?: boolean;
  onHideTree?(): void;
  onReturnTask?(): void;
  onLoadDirectory?(repositoryId: string, path: string): Promise<void>;
  loadedDirectoryKeys?: string[];
  onSearch?(query: string, mode: 'name' | 'content', showIgnored: boolean): void;
  onShowIgnored?(value: boolean): void;
  searchResults?: Array<SearchResult & {repositoryId:string;repositoryName:string}>;
  searchLoading?: boolean;
  searchIncomplete?: boolean;
  treeNotice?: ReactNode;
  readLoading?: boolean;
  readError?: string;
  readMessage?: string;
  readPage?: RepositoryFilePage | null;
  readMatchQuery?: string;
  sizeBytes?: number;
  onReadPage?(index: number): void;
  taskTitle?: string;
  repositoryId?: string;
  checkoutId?: string;
  observedDigest?: string;
  observedRevision?: string;
  observedAt?: string;
  selectionKey?: string;
  markdownOptions?: MarkdownRenderOptions;
  markdownRevision?: string;
  canModify?: boolean;
};

function shortName(path: string) { return path.split('/').at(-1) || path; }
function fileIcon(file: RepositoryPreviewFile) {
  return file.kind === 'image' ? <FileImageOutlined /> : <FileTextOutlined />;
}

/** Candidate view shared by repository and task previews; callers own data and all writes. */
export function RepositoryFileBrowser(props: Props) {
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name');
  const [expandedMatches,setExpandedMatches]=useState<Record<string,boolean>>({});
  const [showIgnored, setShowIgnored] = useState(false);
  const [treeHidden, setTreeHidden] = useState(false);
  const [openPaths, setOpenPaths] = useState<string[]>([props.selectedPath]);
  const [raw, setRaw] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [request, setRequest] = useState<'explain' | 'modify' | null>(null);
  const [requestGoal, setRequestGoal] = useState('');
  const [treeWidth, setTreeWidth] = useState(272);
  const [resizing, setResizing] = useState(false);
  const resizeOrigin = useRef<{ x: number; width: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);
  const scrolls=useRef(new Map<string,number>());
  const selectionKey=props.selectionKey || props.selectedPath;
  const readingKey=selectionKey+':'+(props.readPage?.index??'full');
  const searchQuery = repositorySearchQuery(query);
  const searchTooShort = Boolean(query.trim()) && !searchQuery;
  useEffect(()=>{props.onSearch?.(searchQuery,searchMode,showIgnored);},[searchQuery,searchMode,showIgnored,props.onSearch]);
  const file = props.files.find(item => item.path === props.selectedPath);
  const visible: TreeFile[] = (props.treeRepositories
    ? props.treeRepositories.flatMap(repo => repo.files.map(item => ({ ...item, repositoryId: repo.id, sourceRepositoryId:repo.repositoryId||repo.id, repositoryName: repo.name })))
    : props.files).filter(item => showIgnored || !item.ignored);
  const needle = searchQuery.toLowerCase();
  const matches = needle ? visible.filter(item => (searchMode === 'name' ? item.path : item.content).toLowerCase().includes(needle)) : [];
  const searchCandidates:SearchResult[]=needle ? props.searchResults||matches : [];
  const searchFiles:SearchResult[]=searchCandidates.map(item=>{
    if(searchMode==='name')return {...item,occurrences:[]};
    const supplied=item.occurrences;
    const fallback=item.line?[{line:item.line,excerpt:item.excerpt||''}]:item.content.split('\n').flatMap((line,index)=>line.toLowerCase().includes(needle)?[{line:index+1,excerpt:line}]:[]);
    return {...item,occurrences:supplied||fallback};
  });
  const searchScope=props.treeRepositories?.map(repo=>repo.id+':'+repo.location).join('|');
  useEffect(()=>setExpandedMatches({}),[searchQuery,searchMode,searchScope]);
  useEffect(() => {
    if (!resizing) return;
    const move = (event: PointerEvent) => { const origin = resizeOrigin.current; if (origin) setTreeWidth(Math.max(220, Math.min(440, origin.width + event.clientX - origin.x))); };
    const stop = () => { setResizing(false); resizeOrigin.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  }, [resizing]);
  useEffect(() => {
    setQuery(props.searchSeed || '');
    setSearchMode('name');
    setRaw(false);
    setRange(null);
  }, [props.resetKey]);
  useEffect(() => {
    setOpenPaths(paths => paths.includes(props.selectedPath) ? paths : [...paths, props.selectedPath]);
    setRange(null);
    setRaw(false);
    const parts = props.selectedPath.split('/');
    setExpanded(current => [...new Set([...current, ...(props.treeRepositories || []).map(repo => treeKey('', repo.id)), ...parts.slice(0, -1).map((_, i) => treeKey(parts.slice(0, i + 1).join('/'), props.selectedRepositoryId))])]);
  }, [props.selectedPath, props.selectedRepositoryId, props.treeRepositories?.map(repo => repo.id).join(',')]);
  useEffect(() => {
    if (props.global && !props.readerActive) return;
    if (!props.focusLine) { setRange(null);codeRef.current?.scrollTo({ top: scrolls.current.get(readingKey) || 0 }); return; }
    if(file?.kind==='markdown')setRaw(true);
    setRange([props.focusLine, props.focusLine]);
    requestAnimationFrame(() => {const row=codeRef.current?.querySelector('[data-line="' + props.focusLine + '"]');(row?.querySelector('.repository-search-hit')||row)?.scrollIntoView({ block: 'center',inline:'nearest' });});
  }, [props.focusLine, props.focusRequest, readingKey, props.readerActive, props.readLoading]);

  const treeData = useMemo(() => {
    function sort(nodes: DataNode[]) {
      nodes.sort((a, b) => Number(Boolean(a.isLeaf)) - Number(Boolean(b.isLeaf)) || String(a.key).localeCompare(String(b.key)));
      for (const node of nodes) if (node.children) sort(node.children);
    }
    function compact(nodes: DataNode[]): DataNode[] {
      return nodes.map(node => {
        let current = node, title = node.title;
        while (!current.isLeaf && current.children?.length === 1 && !current.children[0].isLeaf) {
          current = current.children[0]; title = String(title) + ' / ' + String(current.title);
        }
        return { ...current, title, ...(current.children ? { children: compact(current.children) } : {}) };
      });
    }
    function build(items: TreeFile[]) {
      const roots: DataNode[] = [], folders = new Map<string, DataNode>();
      for (const item of items) {
        const parts = item.path.split('/'); let siblings = roots;
        for (let index = 0; index < parts.length - 1; index++) {
          const key = treeKey(parts.slice(0, index + 1).join('/'), item.repositoryId);
          let folder = folders.get(key);
          if (!folder) { folder = { key, title: parts[index], icon: <FolderOutlined />, children: [] }; folders.set(key, folder); siblings.push(folder); }
          siblings = folder.children!;
        }
        if(item.directory) {
          const key=treeKey(item.path,item.repositoryId);
          if(!folders.has(key)){const folder:DataNode={key,title:shortName(item.path),icon:<FolderOutlined />,isLeaf:false,children:[]};folders.set(key,folder);siblings.push(folder);}
          continue;
        }
        siblings.push({ key: treeKey(item.path, item.repositoryId), isLeaf: true, disabled:item.link, icon: fileIcon(item), title: <span className="repository-tree-file" data-file-path={item.path}><span>{shortName(item.path)}</span>{item.status && <i className={'repository-status repository-status-' + item.status}>{item.status}</i>}</span> });
      }
      sort(roots); return props.global && !props.onLoadDirectory ? compact(roots) : roots;
    }
    return props.treeRepositories ? props.treeRepositories.map(repo => ({
      key: treeKey('', repo.id), isLeaf:false, icon: <FolderOpenOutlined />,
      title: <span className="repository-root-name" title={repo.location}><strong>{repo.name}</strong><small>{repo.location}</small></span>,
      children: build(visible.filter(item => item.repositoryId === repo.id)),
    })) : build(visible);
  }, [props.files, props.treeRepositories, showIgnored, props.global]);
  function selectTreeFile(item: TreeFile, line?: number) {
    const matchQuery=line&&searchMode==='content'?searchQuery:undefined;
    if (item.repositoryId && props.onSelectRepositoryFile) props.onSelectRepositoryFile(item.repositoryId, item.path, line, matchQuery);
    else select(item.path, line, matchQuery);
    props.onScene?.(needle ? 'search' : item.kind === 'image' ? 'image' : item.kind === 'markdown' ? 'markdown' : '');
  }

  function select(path: string, line?: number, matchQuery?: string) {
    props.onSelect(path, line, matchQuery);
    if (line) requestAnimationFrame(() => {
      setRange([line, line]);
      const row=codeRef.current?.querySelector('[data-line="' + line + '"]');(row?.querySelector('.repository-search-hit')||row)?.scrollIntoView({ block: 'center',inline:'nearest' });
    });
    const target = props.files.find(item => item.path === path);
    props.onScene?.(needle ? 'search' : target?.kind === 'image' ? 'image' : target?.kind === 'markdown' ? 'markdown' : '');
  }
  function changeQuery(value: string) {
    setQuery(value);
    props.onScene?.(value ? 'search' : '');
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); message.success('已复制'); }
    catch { message.info('可在下方选中文字复制。'); }
  }
  async function refresh() {
    setRefreshing(true);
    if(!props.global){window.setTimeout(() => { setRefreshing(false); void props.onRetry(); message.success('已重新读取模拟文件'); }, 450);return;}
    try{await props.onRetry();}
    catch(error){message.error(error instanceof Error?error.message:'文件暂不可重新读取。');}
    finally{setRefreshing(false);}
  }
  const firstLine=props.readPage?.startLine||1;
  const readMatchActive=searchMode==='content'&&Boolean(searchQuery)&&searchQuery.toLowerCase()===props.readMatchQuery?.toLowerCase();
  const visibleMatch=useMemo(()=>readMatchActive&&props.readPage&&file?visibleRepositoryMatch(file.content,props.readPage):null,[file?.content,props.readPage,readMatchActive]);
  const omitTrailingEmpty=Boolean(props.readPage&&props.readPage.index<props.readPage.total-1);
  const sourceRows=useMemo(()=>repositorySourceLines(file?.content||'',firstLine,visibleMatch||undefined,omitTrailingEmpty),[file?.content,firstLine,visibleMatch,omitTrailingEmpty]);
  const lines=sourceRows.map(row=>row.text);
  const selectedText = range ? lines.slice(Math.max(0,range[0]-firstLine),range[1]-firstLine+1).join('\n') : '';
  const prompt = [
    request === 'modify' ? '请修改以下文件，先核对当前内容，再根据我的目标实施并提供改动与验证依据。' : '请解释以下文件或选中内容的职责、行为和相关影响。',
    '', props.taskTitle ? '任务：'+props.taskTitle : '', '代码库：' + (props.repositoryName || 'Buildr 源码库'),
    props.repositoryId ? '代码库标识：'+props.repositoryId : '',
    props.checkoutId ? '检出目录标识：'+props.checkoutId : '',
    '查看位置：' + props.location, '查看版本：' + props.version, '文件：' + (file?.path || ''),
    props.observedDigest ? '已读内容摘要：'+props.observedDigest : '',
    props.observedRevision ? '文件修订标识：'+props.observedRevision : '',
    props.observedAt ? '观察时间：'+props.observedAt : '',
    props.readPage ? '读取片段：第 '+(props.readPage.index+1)+' / '+props.readPage.total+' 段，字节 '+(props.readPage.offset+1)+'–'+props.readPage.endOffset+' / '+props.sizeBytes+'，第 '+props.readPage.startLine+'–'+props.readPage.endLine+' 行'+(props.readPage.startsMidLine||props.readPage.endsMidLine?'（包含续行）':'') : '',
    range ? '范围：第 ' + range[0] + '–' + range[1] + ' 行'+(props.readPage?'（仅限本段可见内容）':'') : props.readMessage ? '范围：当前可见内容（'+props.readMessage+'）' : '范围：完整文件',
    selectedText ? '\n选中内容：\n' + selectedText : '',
    request === 'modify' ? '\n我的修改目标：\n' + requestGoal : '',
  ].filter(Boolean).join('\n');

  const contextHeader = <>    <header className="repository-browser-context" data-prototype-position="working-directory">
      <div className="repository-context-selection"><FolderOpenOutlined />{props.context}</div>
      {!props.treeRepositories && <code title={props.location}>{props.location}</code>}
      {props.global && !props.treeRepositories && <small className="repository-context-version">{props.version}</small>}
      {props.historical && !props.treeRepositories && <Tag color="gold">历史版本</Tag>}
      <Tooltip title="重新读取当前查看位置"><Button type="text" size="small" aria-label="重新读取文件" loading={refreshing} icon={<ReloadOutlined />} onClick={refresh} /></Tooltip>
    </header>
</>;
  const tree = <>      <aside className="repository-browser-tree" data-prototype-position="source-tree">
        <div className="repository-tree-heading"><strong>文件</strong>{!props.global&&<Tooltip title={treeHidden ? '展开目录' : '收起目录'}><Button type="text" size="small" aria-label={treeHidden ? '展开目录' : '收起目录'} icon={treeHidden ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setTreeHidden(!treeHidden)} /></Tooltip>}</div>
        {(props.global || !treeHidden) && <>
          <div className="repository-file-search" data-prototype-position="file-search">
            <Input allowClear prefix={<SearchOutlined />} placeholder={searchMode==='name'?'搜索文件名，至少 2 个字符':'搜索内容，至少 2 个字符'} aria-label="搜索文件" value={query} onChange={event => changeQuery(event.target.value)} />
            <div className="repository-search-options"><Segmented className="repository-search-mode" size="small" value={searchMode} options={[{ label: '文件名', value: 'name' }, { label: '内容', value: 'content' }]} onChange={value => setSearchMode(value as 'name' | 'content')} /><Tooltip title="包含当前目录中被 Git 忽略规则或常见构建目录排除的文件；点号开头不代表忽略。不会显示其他目录中的文件，Git 管理目录始终隐藏。"><Button size="small" type="text" onClick={() => {setShowIgnored(value => !value);props.onShowIgnored?.(!showIgnored);}}>{showIgnored ? '隐藏忽略文件' : '显示忽略文件'}</Button></Tooltip></div>
          </div>
          <div className="repository-tree-body">
            {props.treeNotice}
            {props.unavailable ? <Alert type="warning" showIcon message="当前目录暂不可读取" description="其他文件入口仍可使用。" action={<Button size="small" onClick={()=>void refresh()}>重试</Button>} /> : searchTooShort ? <p className="repository-search-hint" role="status">输入至少 2 个字符开始搜索</p> : needle ? <div className="repository-search-results">
              <p>{props.searchLoading ? '正在搜索…' : searchFiles.length+' 个匹配文件'+(searchMode==='content'?' · '+searchFiles.reduce((count,item)=>count+(item.occurrences?.length||0),0)+' 条匹配':'')+(props.searchIncomplete?'（搜索未完成）':'')}</p>
              {!(props.searchResults || matches).length && !props.searchLoading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.searchIncomplete ? '当前没有取得匹配结果' : '没有匹配文件'} />}
              {searchFiles.map(item=>{
                const key=treeKey(item.path,item.repositoryId),occurrences=item.occurrences||[],expanded=expandedMatches[key]??true;
                const selected=item.path===props.selectedPath&&item.repositoryId===props.selectedRepositoryId;
                const toggleMatches=()=>setExpandedMatches(previous=>({...previous,[key]:!expanded}));
                return <section key={key} className="repository-search-group" data-repository-id={item.sourceRepositoryId||item.repositoryId} data-source-id={item.repositoryId} data-file-path={item.path}>
                  <div className="repository-search-file-row">
                    {occurrences.length>0&&<button type="button" className="repository-search-expand" aria-label={(expanded?'折叠 ':'展开 ')+item.path+' 的匹配'} aria-expanded={expanded} onClick={toggleMatches}>{expanded?<DownOutlined />:<RightOutlined />}</button>}
                    <button type="button" data-file-path={item.path} data-repository-id={item.sourceRepositoryId||item.repositoryId} data-source-id={item.repositoryId} title={(item.repositoryName?item.repositoryName+' / ':'')+item.path} aria-expanded={searchMode==='content'?expanded:undefined} className={'repository-search-result'+(searchMode==='name'&&selected?' selected':'')} onClick={()=>searchMode==='content'?toggleMatches():selectTreeFile(item)}>{fileIcon(item)}<span className="repository-search-file-info"><span className="repository-search-file-label"><strong>{shortName(item.path)}</strong>{item.repositoryName&&<small>{item.repositoryName}</small>}</span><small className="repository-search-file-path" title={item.path}>{item.path}</small></span>{occurrences.length>0&&<span className="repository-search-count">{occurrences.length}</span>}</button>
                  </div>
                  {occurrences.length>0&&expanded&&<div className="repository-search-occurrences">{occurrences.map(match=><button type="button" key={match.line} className={'repository-search-occurrence'+(selected&&match.line===props.focusLine?' selected':'')} data-match-line={match.line} title={match.line+': '+match.excerpt} onClick={()=>selectTreeFile(item,match.line)}><span className="repository-match-line">{match.line}</span><code><RepositorySearchText text={match.excerpt} query={searchQuery} /></code></button>)}</div>}
                </section>;
              })}
            </div> : <Tree.DirectoryTree expandAction="click" blockNode showIcon loadedKeys={props.loadedDirectoryKeys} loadData={props.onLoadDirectory ? node => {const [repositoryId,...rest]=String(node.key).split('::');return props.onLoadDirectory!(repositoryId,rest.join('::'));} : undefined} expandedKeys={expanded} onExpand={keys => setExpanded(keys.map(String))} selectedKeys={[treeKey(props.selectedPath, props.selectedRepositoryId)]} treeData={treeData} onSelect={keys => { const item = visible.find(item => treeKey(item.path, item.repositoryId) === String(keys[0] || '')); if (item && !item.directory && !item.link) selectTreeFile(item); }} />}
          </div>
          <footer className="repository-tree-footer">{props.treeRepositories ? new Set(props.treeRepositories.map(repo=>repo.repositoryId||repo.id)).size + ' 个代码库 · '+props.treeRepositories.length+' 个目录 · ' : ''}{visible.filter(item=>!item.directory).length} 个已加载文件 · 只读</footer>
        </>}
      </aside>
</>;
  return <section hidden={props.global && !props.readerActive} className={'repository-file-browser' + (props.global ? ' global-reader' : '') + (resizing ? ' is-resizing' : '')} aria-label="资源管理器" style={{ '--repository-tree-width': treeWidth + 'px' } as CSSProperties}>
    {props.global ? props.sidebarHost && createPortal(<>{contextHeader}{tree}</>, props.sidebarHost) : contextHeader}
    <div className={'repository-browser-columns' + (!props.global && treeHidden ? ' tree-hidden' : '')}>
      {!props.global && tree}
      {!props.global && !treeHidden && <button type="button" className="repository-tree-resize" role="separator" aria-label="拖拽调整目录宽度" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={440} aria-valuenow={treeWidth} onPointerDown={event => { event.preventDefault(); resizeOrigin.current = { x: event.clientX, width: treeWidth }; setResizing(true); }} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setTreeWidth(value => Math.max(220, Math.min(440, value + (event.key === 'ArrowRight' ? 16 : -16)))); } }} onDoubleClick={() => setTreeWidth(272)} />}
      <div className="repository-file-pane" data-prototype-position="file-reading">
        {!props.global && <div className="repository-file-tabs" role="tablist" aria-label="打开的文件">
          {openPaths.map(path => <div key={path} className={'repository-file-tab' + (path === props.selectedPath ? ' active' : '')}><button type="button" role="tab" aria-selected={path === props.selectedPath} title={path} onClick={() => select(path)}>{shortName(path)}</button>{openPaths.length > 1 && <button className="repository-file-close" type="button" aria-label={'关闭文件 ' + shortName(path)} onClick={() => { const next = openPaths.filter(item => item !== path); setOpenPaths(next); if (path === props.selectedPath) select(next.at(-1)!); }}>×</button>}</div>)}
        </div>}
        {file && <header className="repository-reader-toolbar">
          <div className="repository-file-identity"><strong>{shortName(file.path)}</strong><small title={props.location + ' / ' + file.path}>{props.repositoryName ? props.repositoryName + ' · ' : ''}{file.path}</small><small className="repository-reading-location">{props.location} · {props.version}</small></div>
          <Space wrap size={4}>
            {props.onReturnTask && <Button size="small" onClick={props.onReturnTask} data-prototype-position="return-task">返回任务</Button>}
            {file.kind === 'markdown' && !props.readPage && <Segmented size="small" value={raw ? 'raw' : 'read'} options={[{ label: '阅读', value: 'read' }, { label: '原文', value: 'raw' }]} onChange={value => setRaw(value === 'raw')} />}
            {props.historical ? <Button size="small" onClick={props.onViewCurrent} data-prototype-position="current-file">查看当前文件</Button> : props.onChanges && <Button size="small" disabled={!file.status} onClick={() => props.onChanges?.(file.path)} data-prototype-position="file-diff-link">查看改动</Button>}
            <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => void copy(file.path)}>复制路径</Button>
          </Space>
        </header>}
        {props.readMessage && <Alert type="warning" message={props.readMessage} />}
        {props.readPage&&<section className="repository-file-pagination" aria-label="大文件分段阅读">
          <div className="repository-file-page-status">大文件分段阅读 · 第 {props.readPage.index+1} / {props.readPage.total} 段 · 第 {props.readPage.startLine}–{props.readPage.endLine} 行 · 字节 {props.readPage.offset+1}–{props.readPage.endOffset} / {props.sizeBytes}{props.readPage.startsMidLine?' · 首行续自上一段':''}{props.readPage.endsMidLine?' · 末行续至下一段':''}</div>
          <Space size={6}><Button size="small" aria-label="上一段" disabled={props.readPage.index===0||!props.onReadPage||props.readLoading||Boolean(props.readError)} onClick={()=>props.onReadPage?.(props.readPage!.index-1)}>上一段</Button><Button size="small" aria-label="下一段" disabled={props.readPage.index>=props.readPage.total-1||!props.onReadPage||props.readLoading||Boolean(props.readError)} onClick={()=>props.onReadPage?.(props.readPage!.index+1)}>下一段</Button>{!props.readError&&<Button size="small" aria-label="重新读取" onClick={()=>void refresh()}>重新读取</Button>}</Space>
          {(visibleMatch?.continuesAfter||visibleMatch?.continuesBefore)&&<p className="repository-file-match-continuation">{visibleMatch.continuesAfter?'匹配文字跨段，下一段继续':'匹配文字续自上一段'}</p>}
        </section>}
        <div className="repository-reader-content" ref={codeRef} onScroll={event=>scrolls.current.set(readingKey,event.currentTarget.scrollTop)}>
          {props.readError ? <div className="repository-reading-empty"><h3>文件暂不可读取</h3><p>{props.readError}</p><Button onClick={()=>void refresh()}>重新读取</Button>{props.historical && <Button onClick={props.onViewCurrent}>查看当前文件</Button>}</div> : refreshing || props.readLoading ? <div className="repository-reading-empty"><Spin /><p>正在重新读取…</p></div> : props.unavailable ? <div className="repository-reading-empty"><FolderOpenOutlined /><h3>当前工作目录暂不可读取</h3><p>保留查看位置，恢复后可继续浏览。</p><Button onClick={()=>void refresh()}>重新读取</Button></div> : !file ? <Empty description="从目录选择一个文件" /> : file.kind === 'unsupported' ? <Empty description="此文件类型暂不支持阅读" /> : file.kind === 'image' ? <div className="repository-image-preview"><img src={file.image} alt={shortName(file.path)} /><p>{shortName(file.path)} · 图片预览</p></div> : file.kind === 'markdown' && !raw && !props.readPage ? <MarkdownHost markdown={file.content} className="markdown-body repository-markdown" renderVersion={props.markdownRevision} options={props.markdownOptions || { allowRelativeLinks: true, onRelativeLinkClick: () => message.info('相关文件可从目录打开。') }} /> : <div className="repository-source-code" aria-label="文件内容">
            {sourceRows.map(({text,line,match},index)=><div key={line} data-line={line} data-line-continuation={index===0&&props.readPage?.startsMidLine||index===lines.length-1&&props.readPage?.endsMidLine||undefined} className={'repository-source-row' + (range && line >= range[0] && line <= range[1] ? ' selected-line' : '')}><button type="button" className="repository-line-number" aria-label={'选择第 '+line+' 行'} onClick={event => setRange(event.shiftKey && range ? [Math.min(range[0],line),Math.max(range[0],line)] : [line,line])}>{line}</button><code><RepositorySearchText text={text} query={searchMode==='content'?searchQuery:''} observed={match} source /></code></div>)}
          </div>}
        </div>
        {file && <footer className="repository-reader-footer" data-prototype-position="agent-file-context">
          <span>{props.global || props.historical ? props.version : '当前文件'}{range ? ' · 已选择第 ' + range[0] + (range[1] !== range[0] ? '–' + range[1] : '') + ' 行' : file.kind === 'unsupported' ? ' · 类型暂不支持' : file.kind === 'image' ? ' · 图片' : props.readPage?' · 本段第 '+props.readPage.startLine+'–'+props.readPage.endLine+' 行':' · 完整文件 · '+lines.length+' 行'}</span>
          <Space size={6}><Button size="small" type="text" onClick={() => setRequest('explain')}>请智能体解释</Button><Tooltip title={props.historical ? '查看当前文件后提出修改' : '带上当前文件和选中范围'}><Button size="small" type="primary" disabled={props.historical || props.canModify === false} onClick={() => { setRequestGoal(''); setRequest('modify'); }}>提出修改</Button></Tooltip></Space>
        </footer>}
      </div>
    </div>
    <Modal open={Boolean(request)} title={request === 'modify' ? '交给智能体（Agent）修改' : '交给智能体（Agent）解释'} onCancel={() => setRequest(null)} footer={<Space><Button onClick={() => setRequest(null)}>返回文件</Button><Button type="primary" icon={<CopyOutlined />} onClick={() => void copy(prompt)}>复制指令</Button></Space>}>
      <p className="page-copy">文件位置、查看版本和选中范围已带入指令。你可以补充目标后交给智能体（Agent）。</p>
      {request === 'modify' && <Input.TextArea aria-label="修改目标" placeholder="描述希望怎样修改…" value={requestGoal} onChange={event => setRequestGoal(event.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} style={{ marginBottom: 12 }} />}
      <Input.TextArea aria-label="文件协作指令" value={prompt} readOnly autoSize={{ minRows: 8, maxRows: 16 }} />
    </Modal>
  </section>;
}
