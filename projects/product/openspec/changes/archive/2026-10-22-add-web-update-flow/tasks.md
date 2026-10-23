# 实施清单

## 服务端

- [x] `src/infrastructure/process.ts` 新增异步 `spawnCommand`，与 `spawnCommandSync` 共享 `buildCommandInvocation` 封装，返回 `{status, stdout, stderr, error}` Promise
- [x] `src/modules/installation/application/update-flow.ts`：进程内单例任务（`idle|preparing|ready|failed|applying`），`prepare` 校验 npm 来源、重新核对 registry 并钉住 `expectedVersion` 后异步 `npm cache add`；`apply` 校验 `expectedVersion` 后异步 `npm install --global --prefer-offline` 并经 `handoffUpdatedBuildrWeb` 交接；`status` 返回真实快照
- [x] `src/modules/installation/interfaces/http/update-flow-http-contracts.ts`：三个 operation 的 request/response/error Schema 与校验器
- [x] `src/modules/installation/interfaces/http/update-flow-http.ts`：`handleTopLevel` contribution，POST 经 `authorizeWrite`、apply 先响应后执行
- [x] `src/modules/installation/module.ts`：注册更新任务 Application 方法与新 HTTP contribution

## 前端

- [x] `tools/codegen/contracts/runtime-system-dto.ts` 纳入新 Schema 并重新生成 `buildr-web/build/generated` DTO
- [x] `src/features/installation/api/update-flow-api.ts`：prepare/status/apply typed client
- [x] `src/features/installation/` 新增顶栏检查更新入口：可见时约 60s 周期检查、点击手动检查、详情弹层展示当前与双轨道版本
- [x] 详情内分阶段交互：更新 → 准备中 → `ready` 二次确认 → apply → 复用 `waitForRestart` 等待新实例并刷新；`failed` 展示原因与重试；保留复制命令与交给 Agent 动作
- [x] `src/app/AppLayout.tsx` 装配入口并替换 `ReleaseAwarenessBanner`；Preview 不渲染入口，development 渲染模拟入口

## 开发版模拟

- [x] `update-flow.ts` 按来源分流：development 来源 prepare/apply 仅模拟状态流转，不查询 registry、不执行子进程、不触发交接；unknown 仍拒绝
- [x] 路由把 `previewIdentity` 传入 contribution，Preview 实例拒绝 update 写入口
- [x] 前端 development 渠道渲染「开发模拟」详情（本地推算目标版本、无复制命令/Agent 动作），`completed` 后经 `/api/v1/app/restart` 真实重启并复用重启观察恢复页面

## 测试

- [x] 更新任务单元测试：状态机迁移、版本钉住与冲突、任务忙拒绝、下载失败、apply 版本校验
- [x] 更新任务单元测试：development 模拟流程零外部副作用、版本校验仍生效
- [x] HTTP 契约测试：三操作 Schema、session 写保护、非法请求无副作用、状态只读、Preview 写入口拒绝；coverage 保持闭合
- [x] 系统级端到端：真实 origin receipt + 安装登记 + authority 校验 + 真实 spawn 桩 npm CLI 驱动 prepare→ready→apply→交接
- [x] 系统级开发模拟：真实 git development checkout 现场驱动模拟 prepare→ready→apply→completed，断言零 spawn/registry/交接副作用
- [x] 既有 release-awareness、`buildr-web-http` 与重启相关测试保持通过

## 当前知识

- [x] `knowledge/code-map/technical-layers.md`：更新/交接职责段落补充页面分阶段更新入口事实
- [x] `knowledge/docs/guides/getting-started.md`：更新说明补充页面内更新入口
- [x] `knowledge/index.yml`：登记新增源码条目（update-flow application、HTTP contracts、前端安装功能）

## 直接验证

- [x] `services/buildr` typecheck 与相关测试通过
- [x] `services/buildr-web` typecheck 与正式 build 通过
- [x] DTO 重复生成无漂移
