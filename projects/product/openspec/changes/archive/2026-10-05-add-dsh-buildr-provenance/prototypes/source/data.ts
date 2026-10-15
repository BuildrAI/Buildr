export type SourceEvidence={owner:string;label:string;evidence:string;scope:string;objects:string[];hasBuildr:boolean;status:string};
export type ContentObject={id:string;title:string;kind:string;owner:string;scope:string;sourceIdentity:string;observedVersion:string;currentVersion:string;historical:string|null;current:string|null;evidence:string;note?:string};
export const objectRegistry:Record<string,ContentObject>={
 'buildr:workspace-demo:rule:core':{id:'buildr:workspace-demo:rule:core',title:'Buildr 核心规则区块',kind:'规则',owner:'Buildr',scope:'workspace-demo',sourceIdentity:'buildr-managed / core-rules',observedVersion:'r1',currentVersion:'r2',historical:'# 智能体优先原则\n\n以真实工作对象为依据。界面与助手共享当前事实。\n本段为 Buildr 受管区块的历史正文（模拟）。',current:'# 智能体优先原则\n\n以真实工作对象为依据。界面与助手共享当前事实。\n新增：写入前校验已观察版本。\n本段为当前版本正文（模拟）。',evidence:'模拟记录中 workspace-demo、buildr-managed、core-rules 三者匹配，范围只覆盖受管区块。',note:'同一 AGENTS 文件的区块外文字不属于此对象。'},
 'project:workspace-demo:rule:team':{id:'project:workspace-demo:rule:team',title:'项目自有约定',kind:'规则',owner:'项目',scope:'workspace-demo',sourceIdentity:'project-owned / team-notes',observedVersion:'p1',currentVersion:'p1',historical:'产品列表按项目自有规范排序。此段在 Buildr 受管区块之外。',current:'产品列表按项目自有规范排序。此段在 Buildr 受管区块之外。',evidence:'模拟记录明确该段为项目维护，不因与 Buildr 位于同一文件而改变归属。'},
 'buildr:workspace-demo:skill:task-review':{id:'buildr:workspace-demo:skill:task-review',title:'task-review',kind:'技能',owner:'Buildr',scope:'workspace-demo',sourceIdentity:'buildr-managed / skill:task-review',observedVersion:'s1',currentVersion:'s2',historical:'# 任务检查\n\n先核对目标和当前成果，再检查实现与验证依据。\n发现缺口时说明影响，不替用户做业务判断。（模拟历史正文）',current:'# 任务检查\n\n先核对目标和当前成果，再检查实现与验证依据。\n新版本另要求明确说明未验证范围。（模拟当前正文）',evidence:'模拟：实际返回的源身份与当前范围内的 Buildr 技能登记匹配；不是仅凭名称。'},
 'external:workspace-demo:skill:task-review':{id:'external:workspace-demo:skill:task-review',title:'task-review（外部同名）',kind:'技能',owner:'外部技能集',scope:'workspace-demo',sourceIdentity:'external-pack / skill:task-review',observedVersion:'e1',currentVersion:'e1',historical:'# 外部检查指南\n\n此说明由外部技能集提供，并非 Buildr 技能。名称相同不改变来源。',current:'# 外部检查指南\n\n此说明由外部技能集提供，并非 Buildr 技能。名称相同不改变来源。',evidence:'模拟：源身份为 external-pack，与 buildr-managed 不同。'},
 'buildr:workspace-demo:material:brief':{id:'buildr:workspace-demo:material:brief',title:'任务资料：列表界面需求',kind:'资料',owner:'Buildr',scope:'workspace-demo',sourceIdentity:'buildr-managed / material:brief',observedVersion:'m1',currentVersion:'m2',historical:'# 列表界面需求\n\n保持标题、说明与操作的位置关系，不改变已有入口。\n检查窄屏与键盘操作。（模拟历史资料）',current:'# 列表界面需求\n\n保持标题、说明与操作的位置关系，不改变已有入口。\n新版本新增触屏布局检查。（模拟当前资料）',evidence:'模拟：资料对象身份、来源登记和 workspace-demo 同时匹配；单独文件路径不能证明提供方。'},
 'buildr:workspace-demo:tool:task-get':{id:'buildr:workspace-demo:tool:task-get',title:'任务资料查询能力',kind:'工具',owner:'Buildr',scope:'workspace-demo',sourceIdentity:'buildr-capability / task-get',observedVersion:'c1',currentVersion:'c1',historical:'用途：返回指定任务的公开资料。\n输入：taskId。\n结果：任务标题和需求摘要。\n副作用：只读。此为能力对象的演示说明，不是已安装新工具。',current:'用途：返回指定任务的公开资料。\n输入：taskId。\n结果：任务标题和需求摘要。\n副作用：只读。此为能力对象的演示说明，不是已安装新工具。',evidence:'模拟：执行入口被解析为已登记 Buildr 能力，参数范围与当前任务匹配；载体仍是 DSH bash。'},
 'buildr:workspace-demo:material:legacy':{id:'buildr:workspace-demo:material:legacy',title:'旧任务指南（历史原文未留存）',kind:'资料',owner:'Buildr',scope:'workspace-demo',sourceIdentity:'buildr-managed / material:legacy',observedVersion:'m0',currentVersion:'m3',historical:null,current:'# 当前任务指南\n\n这是当前文件内容，不能代替历史输入。\n当时只保留对象引用，未保留 m0 正文。（模拟）',evidence:'模拟：来源与范围登记能确认对象引用属于 Buildr，但没有历史正文证据。',note:'只有历史对象引用，不声称当时正文被读取或进入模型。'}
};
function src(owner:string,label:string,evidence:string,objects:string[]=[],hasBuildr=false,status='confirmed'):SourceEvidence{return {owner,label,evidence,objects,hasBuildr,status,scope:'workspace-demo'};}
export const sourceByIndex:Record<number,SourceEvidence>={
0:src('dsh','DSH','模拟：系统提示由 DSH 平台提供。'),
1:src('dsh','DSH','模拟：DSH 运行环境说明，由平台生成，不混作 Buildr 内容。'),
2:src('mixed','混合 · Buildr','AGENTS 包含已确认的 Buildr 受管区块和项目自有文字，只确认各自片段。',['buildr:workspace-demo:rule:core','project:workspace-demo:rule:team'],true),
3:src('user','用户','用户的任务要求；DSH 负责承载，不等于内容提供者。'),
4:src('agent','助手','助手正文；提到 Buildr 不自动成为 Buildr 输入。'),
5:src('buildr','Buildr','能力入口、来源身份及任务范围匹配（模拟）。',['buildr:workspace-demo:tool:task-get'],true),
6:src('buildr','Buildr','技能来源身份及范围匹配（模拟），不按名字判断。',['buildr:workspace-demo:skill:task-review'],true),
7:src('external','外部','同名技能来自 external-pack，不是 Buildr。',['external:workspace-demo:skill:task-review']),
8:src('buildr','Buildr','资料对象、来源登记与当前范围匹配（模拟）。',['buildr:workspace-demo:material:brief'],true),
9:src('unknown','待确认','仅保留路径 AGENTS.md，没有区块归属和来源登记。',[],false,'missing'),
10:src('unknown','待确认','声明来自 Buildr，但返回范围为 workspace-other，与当前范围不匹配。',[],false,'scope-mismatch'),
11:src('project','项目','被开发的代码是任务对象，文件名含 Buildr 也不构成内容提供证据。'),
12:src('buildr','Buildr','嵌套读取的资料对象与来源范围独立匹配（模拟）。',['buildr:workspace-demo:material:brief'],true),
13:src('agent','助手','助手结果说明，不作为内容提供方归属依据。'),
14:src('dsh','DSH','模拟：压缩记录由 DSH 生成，不证明新的 Buildr 参与。'),
15:src('buildr','Buildr · 仅引用','历史对象引用的来源匹配，m0 原文未保留。',['buildr:workspace-demo:material:legacy'],true,'historical-missing')
};
const defs:[string,string,string?,string?][]=[
['system','初始系统提示词'],['context','DSH 环境、权限及可用工具说明'],['context','AGENTS.md：Buildr 受管区块＋项目自有约定'],['user','检查列表界面，并说明 Buildr 内容在哪里提供了工作依据。'],['message','先核对规则、技能来源与任务资料，不按文件名猜测。'],
['tool','bash · Buildr 任务资料查询（能力对象示意）','任务资料已返回','bash'],['tool','skill · task-review（Buildr）','技能说明已返回','skill'],['tool','skill · task-review（外部同名）','外部说明已返回','skill'],['tool','read · 任务资料','资料已返回','read'],['tool','read · AGENTS.md（来源缺失）','文本已返回，来源未记录','read'],['tool','skill · task-review（范围不匹配）','返回声明无法核验','skill'],['tool','read · Buildr 产品组件源码','代码已返回','read'],['subtool','read · 任务资料（嵌套读取）','资料已返回','read'],['message','按已确认来源检查完成；没有把未知内容硬归给 Buildr。'],['compacted','上下文压缩记录'],['context','Buildr 旧任务指南引用（历史原文未留存）']
];
const argObjects:Record<number,unknown>={5:{command:'buildr task get demo-task --json',taskId:'demo-task'},6:{name:'task-review',sourceId:'buildr-managed',scope:'workspace-demo'},7:{name:'task-review',sourceId:'external-pack',scope:'workspace-demo'},8:{file_path:'tasks/demo-task/brief.md',assetId:'material:brief'},9:{file_path:'AGENTS.md'},10:{name:'task-review',scope:'workspace-other'},11:{file_path:'src/BuildrList.tsx'},12:{file_path:'tasks/demo-task/brief.md',parentCall:'mock-call-5'}};
export const allRows=defs.map(([kind,text,result,toolName],index)=>({index,recordId:'mock-record-'+index,kind,text,result,toolName,callId:toolName?'mock-call-'+index:undefined,startedAt:1896139200000+index*1600,timeSeconds:toolName?0.38:0.05,inputDetail:argObjects[index]?JSON.stringify(argObjects[index],null,2):index===2?'<!-- buildr:required begin -->\nBuildr 受管核心规则（模拟）。\n<!-- buildr:required end -->\n\n项目自有约定：产品列表按项目规范排序。':text,outputDetail:toolName?JSON.stringify({status:'returned',summary:result},null,2):kind==='message'?text:undefined,schemaDetail:toolName?JSON.stringify({name:toolName,description:'原工具定义的演示数据；能力仍由内容或入口判定来源。',parameters:{type:'object',properties:{input:{type:'string'}}}}):undefined}));
export const turns=[{turn:null,groups:[{title:'输入与规则',cells:allRows.slice(0,3)}]},{turn:1,groups:[{title:'任务执行',cells:allRows.slice(3)}]}];
export const kinds=[['system','系统'],['user','用户'],['context','上下文'],['compacted','已压缩'],['message','助手'],['tool','工具'],['subtool','子工具']];
