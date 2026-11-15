export type SourceRecord={id?:string;sequence:number;kind:string;text:string;path?:string;turnId?:string;artifact?:{location:string;description:string}};
export type HandoffRound={id:string;title:string;userInputs:string[];assistantNotes:string[];execution:Array<{action:string;result:string;location?:string}>;artifacts:Array<{location:string;description:string}>;finalReply:string|null};

/** Only groups recorded facts. It never infers a missing result or artifact. */
export function roundsFromRecords(records:SourceRecord[]):HandoffRound[]{
 const groups=new Map<string,SourceRecord[]>();let current='turn-1';
 for(const record of [...records].sort((a,b)=>a.sequence-b.sequence)){
  current=record.turnId??current;
  groups.set(current,[...(groups.get(current)??[]),record]);
 }
 return [...groups].map(([id,rows],index)=>({id,title:`第 ${index+1} 轮`,
  userInputs:rows.filter(row=>row.kind==='user').map(row=>row.text),
  assistantNotes:rows.filter(row=>row.kind==='narration').map(row=>row.text),
  execution:rows.filter(row=>['read','write','check'].includes(row.kind)).map(row=>({action:row.kind==='read'?'读取':row.kind==='write'?'修改':'检查',result:row.text,...(row.path?{location:row.path}:{})})),
  artifacts:rows.flatMap(row=>row.artifact?[row.artifact]:[]),
  finalReply:rows.filter(row=>['assistant','decision'].includes(row.kind)).at(-1)?.text??null,
 }));
}
