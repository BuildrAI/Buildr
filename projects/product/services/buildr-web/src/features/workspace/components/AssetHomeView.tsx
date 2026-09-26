import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppstoreOutlined, FolderOutlined, RightOutlined } from '@ant-design/icons';
import './asset-home.css';
type ObjectSummary = { id:string;code:string;name:string;description?:string };
type Props = { kind:'service'|'repository';item:ObjectSummary;hidden?:boolean;hideRelated?:boolean;related:ObjectSummary[];relationHref(object:ObjectSummary):string;onRelation?(object:ObjectSummary):void;actions:ReactNode;notices?:ReactNode;documents?:ReactNode;repositoryContent:ReactNode };
export function AssetHomeView({kind,item,hidden,hideRelated,related,relationHref,onRelation,actions,notices,documents,repositoryContent}:Props) {
  const label = kind === 'service' ? '服务' : '代码库';
  return (
    <div hidden={hidden}><div className="resource-home asset-home">
      <header className="resource-home-head"><div className="asset-home-summary"><p className="resource-eyebrow">{label} <span> / {item.code}</span></p><h1 id={kind === 'service' ? 'service-detail-name' : 'repository-detail-name'}>{item.name}</h1><p id={kind === 'service' ? 'service-detail-description' : 'repository-detail-description'}>{item.description || '尚未填写说明。'}</p></div>{actions}</header>
      {notices}
      {!hideRelated && <section className="resource-section" data-related-resources={kind === 'service' ? 'projects' : 'services'}><div className="resource-section-head"><h2>{kind === 'service' ? '关联项目' : '引用服务'} <span>{related.length}</span></h2></div>
        {related.length ? related.map(object => <Link key={object.id} className="resource-relation-row" to={relationHref(object)} onClick={event => { if (onRelation) { event.preventDefault(); onRelation(object); } }}><span className="resource-row-icon">{kind === 'service' ? <FolderOutlined /> : <AppstoreOutlined />}</span><span className="resource-row-text"><strong>{object.name}</strong><small>{object.description || object.code}</small></span><RightOutlined /></Link>) : <p className="resource-empty-copy">{kind === 'service' ? '还没有项目引用此服务。可在项目主页建立关联。' : '还没有服务引用此代码库。'}</p>}
      </section>}
      {documents}
      {repositoryContent}
    </div></div>
  );
}
