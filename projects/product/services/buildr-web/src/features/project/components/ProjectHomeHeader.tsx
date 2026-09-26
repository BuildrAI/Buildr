import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import '../project-home.css';
type Props = { project:{name:string;description?:string}; workspaceName:string; serviceCount:number|null; href(path:string):string; onWork():void; actions:ReactNode };
export function ProjectHomeHeader({project,workspaceName,serviceCount,href,onWork,actions}:Props) {
  return (
        <header className="project-home-header">
          <div className="project-home-topline">
            <Link className="project-home-back" to={href('/projects')} aria-label="返回项目列表">← 项目列表</Link>
            <div className="project-home-actions">{actions}</div>
          </div>
          <h1 id="project-detail-name">{project.name}</h1>
          <p className="project-home-description" id="project-detail-description">{project.description || '尚未填写项目说明。'}</p>
          <div className="project-home-context">
            <span>{workspaceName || '工作空间'}<span className="project-home-dot">·</span><b id="project-service-count">{serviceCount ?? '尚未完整读取'}</b>{serviceCount === null ? '关联信息' : ' 个关联服务'}</span>
            <Button type="primary" className="project-home-work" onClick={() => onWork()}>查看项目工作 <ArrowRightOutlined /></Button>
          </div>
        </header>

  );
}
