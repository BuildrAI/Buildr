## Context

开发域已有独立网页50548，正承载本轮执行的后台不可强停。

## Decisions

CLI按profile选9519/9518，--port保留覆盖。网页管理新增rebind，携带expectedEndpointId、expectedPort、expectedGeneration；仅允许当前第一方Harness管理者。先绑定新回环端口，后锁内校验旧观察及持有者并提交端口、清空旧票据和页面会话，最后关闭旧网页连接。失败关闭候选监听并保持旧网页和执行。用starting串行化，切换中再次核对协调代次。相同目标视为无副作用观察。不编辑私有状态文件，不使用端口代理，不重启执行器。Development保持4458等现有选择。

## Risks

端口占用保持原地址并明确报错；并发或陈旧观察拒绝；旧网页需重新从启动器打开，已有执行不重发。旧localStorage草稿不跨origin迁移，原页面可保留但不再写入，明确换端口不是历史搬迁。

## Verification

真实HTTP检查端口占用、陈旧观察、失败保全、成功换绑、旧登录失效、新登录及重连后地址保留；检查profile默认值和启动器执行。无付费模型或Windows实机。
