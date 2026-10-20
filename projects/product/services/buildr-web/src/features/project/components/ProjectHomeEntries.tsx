import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ReadOutlined, FileTextOutlined, RightOutlined } from '@ant-design/icons';
export type ProjectHomeEntryRef = 'knowledge' | 'articles';
type Props = { projectCode:string; href(path:string):string; needsKnowledge?:boolean; onEntry?:(ref:ProjectHomeEntryRef, event:MouseEvent<HTMLAnchorElement>) => void };
export function ProjectHomeEntries({projectCode,href,needsKnowledge,onEntry}:Props) { return (
        <nav className="project-home-entries" aria-label="项目内容">
          <Link className="project-home-entry" to={href(`/knowledge/project/${encodeURIComponent(projectCode)}`)}
            data-knowledge-initialize={needsKnowledge || undefined} data-knowledge-initialize-action={needsKnowledge || undefined}
            onClick={event => onEntry?.('knowledge', event)}>
            <span className="project-home-entry-icon knowledge"><ReadOutlined /></span>
            <span><strong>{needsKnowledge ? '建立项目知识' : '项目知识'}</strong><small>{needsKnowledge ? '先建立对项目的整体认识' : '理解目标、主要部分与关键过程'}</small></span>
            <RightOutlined />
          </Link>
          <Link className="project-home-entry" to={href('/articles?project=' + encodeURIComponent(projectCode))} onClick={event => onEntry?.('articles', event)}>
            <span className="project-home-entry-icon"><FileTextOutlined /></span>
            <span><strong>项目文章</strong><small>继续写作，整理与分享项目成果</small></span>
            <RightOutlined />
          </Link>
        </nav>
  ); }
