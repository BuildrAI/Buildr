import{createInterface}from'node:readline';
import fs from'node:fs';
import path from'node:path';
if(process.argv.includes('--version')){console.log('codex 0.163.0');
process.exit(0)}const r=createInterface({input:process.stdin});
const file=path.join(process.env.CODEX_HOME,'state.json');
let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
let active;
const reply=(id,result)=>process.stdout.write(JSON.stringify({id,result})+'\n');
const event=(method,params)=>process.stdout.write(JSON.stringify({method,params})+'\n');
const save=()=>fs.writeFileSync(file,JSON.stringify(state));
r.on('line',l=>{const m=JSON.parse(l);
if(m.method==='initialize'){if(process.env.OPENAI_API_KEY||process.env.CODEX_APP_SERVER_TOKEN)throw Error('credential leak');
reply(m.id,{userAgent:'fixture'});
return;
}
if(m.method==='initialized')return;
if(m.method==='account/read'){reply(m.id,{account:{type:'chatgpt',planType:'fixture'}});
return;
}
if(m.method==='model/list'){reply(m.id,{data:[{id:'fixture-model',displayName:'Fixture'}]});
return;
}
if(m.method==='thread/start'){let t={id:'thread-'+Object.keys(state).length,cwd:m.params.cwd,turns:[]};
state[t.id]=t;
save();
reply(m.id,{thread:t});
return;
}
if(m.method==='thread/resume'||m.method==='thread/read'){reply(m.id,{thread:state[m.params.threadId]});
return;
}
if(m.method==='turn/start'){const p=m.params;
const id='turn-'+state[p.threadId].turns.length;
const user={id:'user-'+id,type:'userMessage',content:p.input};
active={id,threadId:p.threadId,status:'inProgress',items:[user]};
state[p.threadId].turns.push(active);
save();
reply(m.id,{turn:active});
setTimeout(()=>{event('item/started',{threadId:p.threadId,turnId:id,item:user});
event('item/agentMessage/delta',{threadId:p.threadId,turnId:id,itemId:'assistant-'+id,delta:'你好'});
process.stdout.write(JSON.stringify({id:'request-'+id,method:'item/tool/requestUserInput',params:{threadId:p.threadId,turnId:id,questions:[{id:'color',question:'颜色',options:[{label:'蓝'}]}]}})+'\n');
},10);
return;
}
if(!m.method&&m.id?.startsWith('request-')){if(m.result.answers.color.answers[0]!=='蓝')throw Error('wrong answer');
const item={id:'command-'+active.id,type:'commandExecution',command:'synthetic command',processId:'native-process-'+active.id};
active.items.push(item);
event('item/started',{threadId:active.threadId,turnId:active.id,item});
return;
}
if(m.method==='turn/interrupt'){active.status='interrupted';
save();
reply(m.id,{});
event('turn/completed',{threadId:active.threadId,turn:active});
return;
}
if(m.method==='thread/backgroundTerminals/list'){reply(m.id,{data:active?.items.filter(i=>i.type==='commandExecution'&&i.status!=='completed').map(i=>({itemId:i.id,processId:i.processId}))??[],nextCursor:null});
return;
}
if(m.method==='thread/backgroundTerminals/terminate'){if(m.params.processId!=='native-process-'+active.id)throw Error('wrong process');
const item=active.items.find(i=>i.type==='commandExecution');
item.status='completed';
save();
reply(m.id,{});
event('item/completed',{threadId:active.threadId,turnId:active.id,item});
return;
}reply(m.id,{});
});
