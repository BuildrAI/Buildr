export { programmaticOpenApi } from './programmatic-openapi.ts';

export const programmaticGuide = `# Buildr 本机程序 API（第一期）

## 开始
在 Buildr「智能体与模型 → 程序接入」中创建凭据，选择工作空间及权限。创建后宿主自动将令牌保存到当前实例的私有文件（目录700、文件600），在接入条目中可随时查看路径和复制接入信息；无需手工保存。不要把令牌放进聊天、URL或日志。旧版仅哈希凭据无法恢复原令牌，须由人在页面明确确认重新生成并保存，原令牌随之失效。撤销即时影响后续调用，**不会取消已受理工作**。
固定发现路径为 GET /api/v1/programmatic。API地址显示在设置中；Web宿主需要运行，但不需要打开浏览器。程序调用不访问首页、不用x-buildr-session、无需Origin。仍拒绝跨站来源和错误Host。开发版、发布版和预览凭据各自隔离。

以下命令只从文件设置Header，不把令牌放进进程参数或聊天：

~~~bash
    BASE=http://127.0.0.1:端口
    TOKEN_FILE="<接入信息中的凭据文件绝对路径>"
    curl --noproxy '*' --max-time 30 -fsS -H @<(printf 'Authorization: Bearer '; cat "$TOKEN_FILE") "$BASE/api/v1/programmatic"
    curl --noproxy '*' --max-time 30 -fsS -H @<(printf 'Authorization: Bearer '; cat "$TOKEN_FILE") "$BASE/api/v1/programmatic/openapi.json"
    curl --noproxy '*' --max-time 30 -fsS -H @<(printf 'Authorization: Bearer '; cat "$TOKEN_FILE") "$BASE/api/v1/programmatic/example.py" -o /tmp/buildr-example.py
    python3 /tmp/buildr-example.py "$BASE" 工作空间UUID 连接ID "实现一个已授权的小改动" --token-file "$TOKEN_FILE" --state ./buildr-request.json
~~~

示例首次发送前以600保存draftId、clientRequestId、原始输入与serviceId。可使用--model明确模型；不传则使用连接默认模型。再次执行同一命令会读取原提交，再轮询，不新建请求。更换目标请使用新的state文件。不要把包含目标正文的state文件提交到Git。

## 发现与权限
发现返回版本、apiVersion、就绪状态、稳定serviceId、当前凭据、授权工作空间、Agent连接、模型目录、可用操作与文档地址。请选择enabled且status=ready的连接；原生模型来自connections[].models，跨来源模型选择用models目录及其accountId/modelId。Qoder CN的模型来自独立账号native-qoder-cn；发现入口按该账号的登录与已启用模型返回连接状态和模型，发送该连接时可省略modelAccountId。模型实际可用性仍由发送时的Application校验。
- read：发现、查询、读消息及observe（虽为POST，但不发送消息）。
- execute：首发、prepare-send/send、supplement和停止。
- answer：仅回答question卡片；approve：仅处理approval卡片。两者互不替代。
GrokBot默认只授read/execute；问题和审批转人，从同一Buildr Web对话回答。若人明确使用专用自动化凭据回复，必须另授对应权限并提供原卡片的准确身份。
工作空间授权不是操作系统文件沙箱。Agent使用本机工具、规则与已有执行权限；本期程序入口不接受cwd或full-access提升，固定default模式。账号、密钥、升级、全局私有会话及其他管理接口不开放给Bearer。

## 首发与恢复
所有程序提交的clientRequestId必须为小写UUID。先生成并持久保存draftId与clientRequestId（UUID），GET /workspaces/{workspaceId}/conversations/drafts/{draftId}取revision；POST其/send，传connectionId、text、expectedDraftRevision、clientRequestId及可选model、modelAccountId、reasoningEffort。路径均以/api/v1/programmatic开头。
返回202和conversation，**只表示受理，不是工作完成**。保存conversation.id及run身份。首发超时先GET同草稿/submissions/{clientRequestId}；found=true取回原对话。相同draftId/clientRequestId及相同原始输入重复提交不会新建工作；内容不同返回409。found=false只表示当前尚未找到，允许按相同标识和原始输入重试，不换ID。
GET /conversations/{conversationId}或POST /observe（正文{}）轮询。Web和API读取相同事实。当前run与retainedRuns均须按准确runId跟踪：completed/failed/stopped为相应终态；starting/running/stopping/tools-active仍有工作；waiting-question/waiting-approval需交互；unknown不是失败或重发许可。保留已收到的结果与标识，不能把HTTP断开当取消。
宿主重启后凭据及对话保留。端口变化时从设置更新地址；发现serviceId必须相同，若不同不要向另一实例重放请求。凭据撤销后由用户重新授权，不读取浏览器认证兜底。

## 后续消息、读取与停止
后续消息先prepare-send，使用当前conversation.revision、connectionId、text和模型选项；prepare-send 响应字段名是 token，不是 previewToken；send 的 previewToken 取自这个 token 字段，即 previewToken = prepareResponse.token，同时 expectedRevision = prepareResponse.revision。再send带上述previewToken及稳定clientRequestId。发送超时先GET /conversations/{conversationId}/submissions/{clientRequestId}读取原结果；同请求标识不得换正文。若冲突，重新观察并理解变化，不自动把旧意图套上新版本发送。
GET对话与/entries支持before、limit分页；较早消息通过nextBefore续读。entries包含正文、工具状态和presentedFiles等实际提供的成果引用；最终总结不等于测试、Git交付等外部事实已成立。taskLinks/taskIds指向同一工作空间中的任务记录；不复制为另一套任务事实。
停止整个对话使用POST /stop-all，传expectedRevision和稳定clientRequestId，覆盖受理时全部在途轮次、追加队列与待发送输入；超时先读stopRequest核对原请求，不以新身份重发。精确停止某轮或工具使用POST /stop，传expectedRevision、runId、participantId、generation（可选toolId），全部来自刚观察的准确原执行。不要按最新对话猜测要停哪个run。
问题回复用POST /requests/{requestId}/reply，正文同样含expectedRevision、runId、participantId、generation和answer；结构化问题使用原question/option标识，不猜位置。服务继续校验原卡片与执行代次，旧卡片返回冲突。
本期不开放程序事件流；轮询通常2秒即可，按响应节流。以后增加事件流不改变恢复原标识的原则。

## 错误与副作用
400参数/字段非法；401无有效凭据或已撤销；403工作空间/操作越权或跨站；404对象/路由不存在；409修订漂移、执行身份变化或同标识不同内容；413正文过大；415非JSON；503未就绪或结果未知。响应为{error:{code,message}}，保留code用于诊断。
POST observe只更新观察；首发、send、supplement可启动本机工具；reply可放行原操作；stop影响指定执行。API接入不授予Git提交/推送、发布或其他目标之外的副作用。

## 文档
先阅读本指南，再读取轻量操作目录 GET /api/v1/programmatic/operations；需要哪个操作，再按目录中的documentationUrl读取 GET /api/v1/programmatic/operations/{operationId}。单操作描述是自包含的OpenAPI，只包含该操作与全部传递依赖模型，无需下载其他文档来解析引用。例如start是首发，observe是重新观察；具体字段以对应描述为准。
目录与发现返回contractVersion，单操作描述包含x-buildr-contract-version。调用方可缓存文档；内容摘要未变不必重读，变化后再更新所需操作。它不是实时工作状态的缓存版本，不能代替重新观察修订与执行身份。
完整OpenAPI：/api/v1/programmatic/openapi.json，使用components.schemas和$ref共享模型，供完整导入或生成客户端，不要求每次调用前读取。可运行示例：/api/v1/programmatic/example.py。所有程序文档均需要Bearer。已登录的人可在「智能体与模型 → 程序接入」直接查看指南、操作目录/单操作和完整OpenAPI并下载，无需输入Bearer；网页文档入口使用现有网页会话，不向程序开放凭据管理权限。API主版本在路径和发现中明确；第一期仅对显式列出的程序操作承诺，不代表所有网页API已对外开放。
`;

export const programmaticExample = `#!/usr/bin/env python3
"""Buildr: persist first, submit idempotently, poll; never print the bearer."""
import argparse, json, os, stat, time, uuid, urllib.request, urllib.error, urllib.parse
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('base'); p.add_argument('workspace'); p.add_argument('connection'); p.add_argument('text')
p.add_argument('--model'); p.add_argument('--state',default='buildr-request.json'); p.add_argument('--token-file',default=str(Path.home()/'.buildr/grokbot.token'))
p.add_argument('--polls',type=int,default=150)
a=p.parse_args(); address=urllib.parse.urlsplit(a.base)
if address.scheme!='http' or address.hostname!='127.0.0.1' or not address.port or address.username or address.password or address.path not in ['', '/'] or address.query or address.fragment: raise SystemExit('只允许明确端口的本机Buildr地址')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
token_path=Path(a.token_file)
s=token_path.lstat()
if not stat.S_ISREG(s.st_mode) or s.st_mode & 0o077: raise SystemExit('凭据必须为普通私有文件（600）')
token=token_path.read_text().strip(); root=a.base.rstrip('/')+'/api/v1/programmatic'
def call(path,body=None):
    req=urllib.request.Request(root+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with opener.open(req,timeout=30) as r: return json.load(r)
    except urllib.error.HTTPError as e: raise SystemExit('HTTP '+str(e.code)+' '+e.read().decode())
info=call(''); state_path=Path(a.state)
if state_path.exists():
    state=json.loads(state_path.read_text())
    if state['serviceId']!=info['serviceId'] or state['workspace']!=a.workspace: raise SystemExit('实例或工作空间变化，拒绝重放')
else:
    if not any(w['id']==a.workspace for w in info['workspaces']): raise SystemExit('工作空间未授权')
    draft=str(uuid.uuid4()); revision=call('/workspaces/'+a.workspace+'/conversations/drafts/'+draft)['revision']
    body={'connectionId':a.connection,'text':a.text,'expectedDraftRevision':revision,'clientRequestId':str(uuid.uuid4())}
    if a.model: body['model']=a.model
    state={'serviceId':info['serviceId'],'workspace':a.workspace,'draftId':draft,'body':body}
    fd=os.open(state_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f: json.dump(state,f); f.flush(); os.fsync(f.fileno())
base='/workspaces/'+state['workspace']+'/conversations'; draft=base+'/drafts/'+state['draftId']
found=call(draft+'/submissions/'+state['body']['clientRequestId'])
view=found['conversation'] if found['found'] else call(draft+'/send',state['body'])['conversation']
print('conversationId='+view['id'],flush=True)
run_id=view.get('run',{}).get('id')
for _ in range(a.polls):
    view=call(base+'/'+view['id']+'/observe',{})
    runs=[view.get('run')]+view.get('retainedRuns',[])
    run=next((r for r in runs if r and r.get('id')==run_id),None)
    if view.get('requests'):
        print('需要用户本人在Buildr中处理问题或审批：'+json.dumps(view['requests'],ensure_ascii=False)); break
    if run and run['status'] in ['completed','failed','stopped']: break
    time.sleep(2)
print(json.dumps(view,ensure_ascii=False,indent=2))
print('消息较多时用GET对话?before=nextBefore&limit=100续读；状态未知或轮询结束不是失败，不要另建请求。')
`;
