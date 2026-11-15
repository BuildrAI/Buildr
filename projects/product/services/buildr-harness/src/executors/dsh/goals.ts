import {bounded} from '../native-process.ts';
import {dshValue} from './client.ts';
import {ExecutorInputRejected} from '../../contracts.ts';

/** New explicit input takes precedence over autonomous rounds of an older goal.
 * Preserve its objective; only pause its automatic activation, never complete it. */
export async function pausePreviousDshGoal(remote:any,id:string,snapshot:()=>Promise<any>):Promise<void> {
  const goalOf=(value:any)=>value.agent?.goal?.goal??value.projections?.values?.goal?.currentValue?.current?.goal;
  const before=goalOf(await snapshot());
  if(before?.phase!=='active')return;
  try {
    dshValue(await bounded(remote.commands.execute(id,'/goal pause',[]),5000));
    const after=goalOf(await snapshot());
    if(after?.id!==before.id||after.phase!=='paused')throw new Error('dsh_goal_pause_unconfirmed');
  }catch{throw new ExecutorInputRejected('dsh_goal_pause_unconfirmed');}
}
