import { Button } from 'antd';
import { activityFilterLabels, type ActivityCounts, type ActivityFilter } from './conversation-activity';

type Props={counts?:ActivityCounts;value:ActivityFilter;stale?:boolean;executionFiltered?:boolean;onChange(value:ActivityFilter):void};
export function ConversationActivityFilters({counts,value,stale,executionFiltered,onChange}:Props) {
  return <div className="ac-activity-filters" role="group" aria-label={stale?'活动分类（未更新）':'活动分类'}>
    {Object.entries(activityFilterLabels).map(([key,label])=>{
      const filter=key==='active'?null:key as Exclude<ActivityFilter,null>;
      const selected=value===filter&&!(filter===null&&executionFiltered);
      return <Button key={key} type="text" size="small" disabled={!counts} aria-pressed={selected}
        className={selected?'is-selected':''} onClick={()=>onChange(value===filter?null:filter)}>
        <span>{label}</span><small>{counts?.[key as keyof ActivityCounts]??'—'}</small>
      </Button>;
    })}
    {!counts&&<small className="ac-activity-counts-note">分类暂不可用</small>}
    {counts&&stale&&<small className="ac-activity-counts-note">未更新</small>}
  </div>;
}
