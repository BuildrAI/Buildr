import { Alert, Button } from 'antd';
import { activityFilterLabels, type ActivityCounts, type ActivityFilter } from './conversation-activity';

type Props={counts?:ActivityCounts;value:ActivityFilter;stale?:boolean;executionFiltered?:boolean;onChange(value:ActivityFilter):void};
export function ConversationActivityFilters({counts,value,stale,executionFiltered,onChange}:Props) {
  return <><div className="ac-activity-filters" role="group" aria-label={stale?'活动分类（未更新）':'活动分类'}>
    {Object.entries(activityFilterLabels).map(([key,label])=>{
      const filter=key as Exclude<ActivityFilter,null>;
      const selected=value===filter&&!executionFiltered;
      return <Button key={key} type="text" size="small" disabled={!counts} aria-pressed={selected}
        className={selected?'is-selected':''} onClick={()=>onChange(value===filter?null:filter)}>
        <span>{label}</span><small>{counts?.[key as keyof ActivityCounts]??'—'}</small>
      </Button>;
    })}
    {!counts&&<small className="ac-activity-counts-note">分类暂不可用</small>}
    {counts&&stale&&<small className="ac-activity-counts-note">未更新</small>}
  </div>
    {!!counts?.unknown&&<Alert className="ac-activity-unknown-notice" type="warning" showIcon message={`${counts.unknown} 个对话的执行状态暂时无法确认${stale?'（未更新）':''}`} action={<Button type="text" size="small" aria-pressed={value==='unknown'&&!executionFiltered} onClick={()=>onChange(value==='unknown'?null:'unknown')}>{value==='unknown'?'返回全部':'查看对话'}</Button>}/>}
  </>;
}
