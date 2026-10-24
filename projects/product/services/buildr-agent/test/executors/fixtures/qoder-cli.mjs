import{createInterface}from'node:readline';
if(process.argv.includes('--version')){console.log('Qoder CLI 1.1.75');
process.exit(0)}const r=createInterface({input:process.stdin});
let input,sid=process.argv.includes('--session-id')?process.argv[process.argv.indexOf('--session-id')+1]:'account-probe';
const emit=m=>process.stdout.write(JSON.stringify(m)+'\n');
const ack=(id,response={})=>emit({type:'control_response',response:{subtype:'success',request_id:id,response}});
r.on('line',line=>{const m=JSON.parse(line);
if(m.type==='control_request'){const t=m.request.type??m.request.subtype;
if(t==='initialize'){ack(m.request_id,{commands:[],agents:[],output_style:'default',available_output_styles:['default'],models:[{value:'fixture-model',displayName:'Fixture model'}],account:{userId:'fixture-user',subscriptionType:'test'},capabilities:['interrupt_receipt_v1']});
emit({type:'system',subtype:'init',session_id:sid??'pending',uuid:'sys',protocol_version:'1.5.0',qodercli_version:'1.1.75',cwd:process.cwd(),tools:[],mcp_servers:[],model:'fixture-model',permissionMode:'default'});
return;
}
if(t==='account_info'){ack(m.request_id,{userId:'fixture-user'});
return;
}
if(t==='get_models'){ack(m.request_id,{models:[{value:'fixture-model',displayName:'Fixture model'}]});
return;
}
if(t==='interrupt'){ack(m.request_id,{still_queued:[]});
emit({type:'result',subtype:'success',is_error:true,terminal_reason:'aborted_tools',session_id:sid,uuid:'end',num_turns:1,usage:{},modelUsage:{},permission_denials:[],result:''});
return;
}ack(m.request_id,{});
return;
}
if(m.type==='user'){input=m;
sid=m.session_id??process.argv[process.argv.indexOf('--session-id')+1];
emit({type:'assistant',uuid:'snapshot-1',session_id:sid,message:{id:'message-live',content:[{type:'text',text:'正在处理'}]}});
emit({type:'control_request',request_id:'permission-native',session_id:sid,request:{subtype:'can_use_tool',tool_name:'AskUserQuestion',tool_use_id:'ask-color',input:{questions:[{question:'选择颜色',options:[{label:'蓝'}]}]}}});
return;
}
if(m.type==='control_response'&&m.response.request_id==='permission-native'){if(m.response.response.updatedInput.answers['选择颜色']!=='蓝')throw Error('wrong answer');
emit({type:'assistant',uuid:'snapshot-2',session_id:sid,message:{id:'message-live',content:[{type:'text',text:'正在处理，已收到蓝色'}]}});
}});
