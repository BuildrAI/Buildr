import {ConversationHandoffDrawer} from '../../features/agent-conversations/ConversationHandoffDrawer';
import type {ExecutionChange} from './handoff-display';
import {roundsFromRecords,type SourceRecord} from './handoff-material';
type Props={open:boolean;side:'left'|'right';agent:string;model:string;changes:ExecutionChange[];text:string;through:number;records:SourceRecord[];received:boolean;issue?:string;onClose():void};
/** Simulation only: the reviewed and live displays share the same component. */
export function MaterialDrawer({agent,model,changes,text,through,records,...props}:Props){
 const rounds=roundsFromRecords(records).map(r=>({...r,from:records.find(e=>e.turnId===r.id)?.sequence??1,through,finalReply:r.finalReply??undefined}));
 return <ConversationHandoffDrawer {...props} material={{agent,model,changes,rounds,body:text,sourceThrough:through,mode:'records'}}/>;
}
