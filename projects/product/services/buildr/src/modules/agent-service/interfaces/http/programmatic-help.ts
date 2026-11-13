export { programmaticOpenApi } from './programmatic-openapi.ts';

export const programmaticGuide = `# Buildr 本机程序 API（第二期）

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
- 全部授权：凭据携带“允许全部授权执行”开关（allowFullAccess，默认开启），在「程序接入」创建时选择或在凭据卡片切换。开启时start/send/续聊可传permissionMode=full-access，与网页选择全部授权一致；关闭时请求full-access返回403。发现入口connections[].capabilities.permissionModes透传连接真实支持的模式，支持全部授权的连接列出["default","full-access"]。
当前凭据的实际权限以发现入口 GET /api/v1/programmatic 返回的 credential.scopes 和各 capability.scope 为准，不以产品名、示例、旧配置或历史对话推断。问题和审批可转人从同一 Buildr Web 对话回答；若使用专用自动化凭据回复，必须为该凭据授予 answer 或 approve，并使用原卡片的准确身份。
工作空间授权不是操作系统文件沙箱。Agent使用本机工具、规则与已有执行权限。程序入口仍不接受任意cwd；start/send等显式发送请求省略permissionMode时默认default，单步续聊/messages省略时沿用该对话最近一轮执行的permissionMode；显式full-access按上述凭据开关门禁。账号、密钥、升级、全局私有会话及其他管理接口不开放给Bearer。

## 首发与恢复
所有程序提交的clientRequestId必须为小写UUID。先生成并持久保存draftId与clientRequestId（UUID），GET /workspaces/{workspaceId}/conversations/drafts/{draftId}取revision；POST其/send，传connectionId、text、expectedDraftRevision、clientRequestId及可选model、modelAccountId、reasoningEffort。路径均以/api/v1/programmatic开头。
返回202和conversation，**只表示受理，不是工作完成**。保存conversation.id及run身份。首发超时先GET同草稿/submissions/{clientRequestId}；found=true取回原对话。相同draftId/clientRequestId及相同原始输入重复提交不会新建工作；内容不同返回409。found=false只表示当前尚未找到，允许按相同标识和原始输入重试，不换ID。
GET /conversations/{conversationId}或POST /observe（正文{}）轮询。Web和API读取相同事实。当前run与retainedRuns均须按准确runId跟踪：completed/failed/stopped为相应终态；starting/running/stopping/tools-active仍有工作；waiting-question/waiting-approval需交互；unknown不是失败或重发许可。保留已收到的结果与标识，不能把HTTP断开当取消。
宿主重启后凭据及对话保留。端口变化时从设置更新地址；发现serviceId必须相同，若不同不要向另一实例重放请求。凭据撤销后由用户重新授权，不读取浏览器认证兜底。

## 后续消息、读取与停止
后续消息先prepare-send，使用当前conversation.revision、connectionId、text和模型选项；prepare-send 响应字段名是 token，不是 previewToken；send 的 previewToken 取自这个 token 字段，即 previewToken = prepareResponse.token，同时 expectedRevision = prepareResponse.revision。再send带上述previewToken及稳定clientRequestId。发送超时先GET /conversations/{conversationId}/submissions/{clientRequestId}读取原结果；同请求标识不得换正文。若冲突，重新观察并理解变化，不自动把旧意图套上新版本发送。
单步续聊用POST /conversations/{conversationId}/messages（execute），正文必填text与clientRequestId，可选expectedRevision与permissionMode（default或full-access）。省略permissionMode时沿用该对话最近一轮执行的模式，因此上一轮为full-access时不会悄悄退回default；显式full-access仍受凭据allowFullAccess门禁，关闭时返回403 programmatic_forbidden。它内部完成prepare-send与send，复用原连接与模型，返回202和runId，幂等规则与send一致：相同clientRequestId与相同正文重放返回原run，正文不同返回409。对话仍在执行或修订漂移返回409；没有可复用执行返回agent_conversation_idle。需要精确控制预览或模型时仍用prepare-send/send。
GET对话与/entries支持before、limit分页；较早消息通过nextBefore续读。entries包含正文、工具状态和presentedFiles等实际提供的成果引用；最终总结不等于测试、Git交付等外部事实已成立。taskLinks/taskIds指向同一工作空间中的任务记录；不复制为另一套任务事实。
列表GET /workspaces/{workspaceId}/conversations支持taskId、cursor、limit、hidden、query、active、attention、fields。active=true只返回活动中的对话：有待决请求、仍有执行中或未释放的工作，或产生了尚未查看的新结果；已完成但未查看的对话属于active，不属于attention。attention=true只返回待处理对话：存在待决问题/审批，或当前执行状态为failed/unknown；单是已完成未查看不算attention。关闭已释放的unknown等用户确认善后后，不再因历史未知继续active。fields=summary仅返回id、title、runStatus、updatedAt、active、pendingDecisionCount；activityCounts始终返回，limit只限制返回页，activityCounts.active与active=true的总数一致、activityCounts.attention与attention=true的总数一致。
停止整个对话使用POST /stop-all，传expectedRevision和稳定clientRequestId，覆盖受理时全部在途轮次、追加队列与待发送输入；超时先读stopRequest核对原请求，不以新身份重发。精确停止某轮或工具使用POST /stop，传expectedRevision、runId、participantId、generation（可选toolId），全部来自刚观察的准确原执行。不要按最新对话猜测要停哪个run。
问题回复用POST /requests/{requestId}/reply，正文同样含expectedRevision、runId、participantId、generation和answer；结构化问题使用原question/option标识，不猜位置。服务继续校验原卡片与执行代次，旧卡片返回冲突。GET对话与POST /observe返回的requests[]每项都含description，说明始终存在，卡片没有说明时为空字符串；问题卡另含全部questions与options，审批卡另含全部options。
本期不提供程序实时事件流；除回推外仍按轮询观察，通常2秒即可，按响应节流。回推与事件补读见下节，不改变恢复原标识的原则。

## 事件回推
回推按凭据配置：在「智能体与模型 → 程序接入」展开凭据详情，设置接收地址、密钥、启停、速率上限、中间进度与停滞提醒开关，并可发送测试通知。中间进度和停滞提醒默认开启。原全局“事件通知”已退役，既有配置自动迁移到历史兼容凭据并保持停用。密钥只保存在本机私有文件（600），界面默认隐藏、日志不输出明文；投递以 Authorization: Bearer 携带密钥。管理入口仅网页会话可用，不向 Bearer 开放。
只有被该凭据接管（首次 API 创建/发送/续聊/补充即标记）的对话才会回推。业务事件为 decision.requested（问题或审批）、run.progress（新的 assistant 中间消息）、run.completed、run.failed、run.stopped（非该凭据发起的停止）和 run.stalled（运行中连续 20 分钟没有新记录）。不推工具调用明细、流式 token、思考、starting/running 状态转换或标题生成。
每条事件正文都含 eventId（全局唯一）、type、occurredAt、machine{id,name}、workspaceId、conversationId、title、runId、runStatus、summary（≤500 字符）、detailUrl（完整对话读取地址）、scopes（当前凭据权限数组）和 allowFullAccess（当前凭据“允许全部授权执行”开关）。scopes 与 allowFullAccess 在每次程序调用或回推配置操作时更新，是事件生成时的凭据权限快照；接收方仍应以发现入口的当前值为准。不含任何密钥或接收地址。
run.completed、run.failed 和 run.stopped 另含 finalReply（该 run 最终 assistant 回复的完整文本，不截断）和 finalReplyUrl。finalReplyUrl 是相对本机 API 根路径的轻量读取地址，GET 该地址只需 read 权限，返回 {runId,finalReply}，不返回整个对话。示例：
~~~json
{"eventId":"...","type":"run.completed","occurredAt":"2026-11-13T03:00:00.000Z","machine":{"id":"machine-id","name":"buildr-host"},"workspaceId":"...","conversationId":"...","title":"发布候选版","runId":"...","runStatus":"completed","finalReply":"完整最终回复……","finalReplyUrl":"/api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}/runs/{runId}/final-reply","scopes":["read","execute","answer","approve"],"allowFullAccess":true,"summary":"完整最终回复……","detailUrl":"/api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}","sequence":42}
~~~
decision.requested 的 request 含 requestId、kind、title、description、runId、participantId、generation、conversationRevision，以及卡片的全部内容：审批卡 options 每项含 optionId、label、description；问题卡 questions 每项含 questionId、question、allowOther、multiple、options。description 始终存在；卡片没有说明时为空字符串。回答时使用这些准确标识，不要按最新对话猜测。示例：
~~~json
{"type":"decision.requested","request":{"requestId":"...","kind":"question","title":"确认范围","description":"本轮需要确认两个问题。","runId":"...","participantId":"...","generation":"...","conversationRevision":"...","questions":[{"questionId":"scope","question":"处理范围","allowOther":true,"multiple":true,"options":[{"optionId":"all","label":"全部","description":"覆盖所有文件"},{"optionId":"changed","label":"仅变更"}]}]}}
~~~
run.progress 在新 assistant 中间消息出现时产生。payload 的 progress 含 text（最新一条中间消息全文）、elapsedMs（run 到本次推送已运行时长）和 completedToolCount（已完成工具数）。同一 run 相邻两次推送至少间隔 5 分钟；间隔内只保留最新一条，窗口结束推送最新内容。首次新中间消息在满足间隔时立即推送。正文为空的中间消息（例如刚创建、正文尚未写入）不推送，也不占用 5 分钟窗口；等该消息取到非空正文后再按上述窗口规则推送。示例：
~~~json
{"type":"run.progress","runId":"...","runStatus":"running","progress":{"text":"已完成日志定位，正在复现问题……","elapsedMs":420000,"completedToolCount":3}}
~~~
run.stalled 仅在当前对话仍包含该 run、其状态为 starting/running/tools-active，且连续 20 分钟没有新消息、工具调用或状态变化时推送一次；unknown、waiting-question、waiting-approval、终态以及已不在当前对话或 retainedRuns 中的轮次都不产生该事件。缺少可用的 lastActivityAt 时不触发，不按 1970-01-01 计算。payload 的 stalled 含 idleMs 与 lastActivityAt，并与其他事件一样含 scopes 与 allowFullAccess。同一段空闲期只推送一次，去重记录持久化，服务重启不会重报；恢复产生新记录后重置计时，再连续空闲 20 分钟才会再次推送。示例：
~~~json
{"type":"run.stalled","runId":"...","runStatus":"running","stalled":{"idleMs":1200000,"lastActivityAt":"2026-11-13T02:40:00.000Z"},"summary":"执行已连续 20 分钟没有新记录"}
~~~
速率按凭据计，默认 180/小时、20/分钟，可在界面调整；run.progress 与 run.stalled 同样计入。限额内立即推送；超限按同对话同类型合并（保留最新状态与 mergedCount），配额恢复后补发；decision.requested 优先且永不合并。投递为 HTTP POST JSON、每请求一条事件、不跟随重定向、仅 2xx 成功；失败按 10/30/90/270/810 秒退避，最多 5 次后置为 undelivered。响应丢失可能重复到达同一 eventId。
回推总开关停用（state=disabled）只停止对外投递，不停止事件记录：已开启的上述事件仍写入同一持久事件流，可用 events 补查；停用期间已记录的事件不会在重新启用后重放。中间进度或停滞提醒单独关闭时，不生成对应事件。未配置回推的凭据不产生事件。events 补读与实时投递共用同一持久事件正文；已记录或已送达的历史事件不会因升级、激活或重启被补写 finalReply、stalled、scopes 等字段，回读始终是首次记录时的原正文。
事件持久保留7天、sequence跨重启连续。补读 GET /api/v1/programmatic/workspaces/{workspaceId}/events?after={cursor}&limit={n}（read，limit 默认 50、最大 200），按 sequence 升序返回含 undelivered 的事件；after 必须是上一页 nextCursor 返回的非负整数序号，不是合法游标时返回 400 programmatic_input_invalid。nextCursor 始终返回本页最后一条事件的 sequence（字符串）；本页为空时返回请求中的 after；未传 after 且没有任何事件时为 null。hasMore 表示以 after=nextCursor 再次读取时是否还有更多事件。轮询方应保存 nextCursor，下次用 after=nextCursor 补查，而不是把 null 当作继续游标。超出保留期被丢弃时发出 events_dropped。测试环境、候选实例与自动化测试一律不得向真实接收地址推送，只用本地假接收端。
最小闭环：配置回推→收到decision.requested→按detailUrl读对话取得准确卡片身份→由人回答或审批；执行结束后用单步续聊POST /messages发起下一轮。

## 错误与副作用
400参数/字段非法；401无有效凭据或已撤销；403工作空间/操作越权或跨站；404对象/路由不存在；409修订漂移、执行身份变化或同标识不同内容；413正文过大；415非JSON；503未就绪或结果未知。响应为{error:{code,message}}，保留code用于诊断。
POST observe只更新观察；首发、send、supplement可启动本机工具；reply可放行原操作；stop影响指定执行。API接入不授予Git提交/推送、发布或其他目标之外的副作用。

## 文档
先阅读本指南，再读取轻量操作目录 GET /api/v1/programmatic/operations；需要哪个操作，再按目录中的documentationUrl读取 GET /api/v1/programmatic/operations/{operationId}。单操作描述是自包含的OpenAPI，只包含该操作与全部传递依赖模型，无需下载其他文档来解析引用。例如start是首发，observe是重新观察；具体字段以对应描述为准。
目录与发现返回contractVersion，单操作描述包含x-buildr-contract-version。调用方可缓存文档；内容摘要未变不必重读，变化后再更新所需操作。它不是实时工作状态的缓存版本，不能代替重新观察修订与执行身份。
完整OpenAPI：/api/v1/programmatic/openapi.json，使用components.schemas和$ref共享模型，供完整导入或生成客户端，不要求每次调用前读取。可运行示例：/api/v1/programmatic/example.py。所有程序文档均需要Bearer。已登录的人可在「智能体与模型 → 程序接入」直接查看指南、操作目录/单操作和完整OpenAPI并下载，无需输入Bearer；网页文档入口使用现有网页会话，不向程序开放凭据管理权限。API主版本在路径和发现中明确；第二期仅对显式列出的程序操作承诺，不代表所有网页API已对外开放。
`;

export const programmaticExample = `#!/usr/bin/env python3
"""Buildr: persist first, submit idempotently, poll; never print the bearer."""
import argparse, json, os, stat, time, uuid, urllib.request, urllib.error, urllib.parse
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('base'); p.add_argument('workspace'); p.add_argument('connection'); p.add_argument('text')
p.add_argument('--model'); p.add_argument('--permission-mode',choices=['default','full-access'],default='default'); p.add_argument('--state',default='buildr-request.json'); p.add_argument('--token-file',default=str(Path.home()/'.buildr/grokbot.token'))
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
    if a.permission_mode!='default': body['permissionMode']=a.permission_mode
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
