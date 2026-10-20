## 1. Buildr Web 生命周期：显式替换来源不匹配的开发实例

- [x] 1.1 `instance-lifecycle.ts` 解析 `--replace-mismatched-development`：仅 development profile 接受，与 `--update-handoff`/`--launcher-binding` 互斥；`assertCompatibleInstance` 拆分兼容性校验与来源判定，返回可区分「复用/需替换/冲突」的结果（验证：新增分支编译通过，现有 409 测试不受影响）。
- [x] 1.2 启动锁内替换路径：不匹配实例经 `shutdownInstance` + `waitForExit` 正常退出后按现有块启动新实例；receipt 被替换或退出超时保留现场并报明确错误码（验证：`buildr-web-runtime.test.ts` 增加替换分支——伪造不匹配后带 flag 启动，旧实例收到认证退出、新实例 receipt 写入且 health 身份匹配）。
- [x] 1.3 `src/web/interfaces/cli/web.ts` help 补该 flag 的用途与适用范围（验证：help 文本含 development 专属说明）。

## 2. DSH 插件：打开动作驱动有界恢复

- [x] 2.1 `bridge.ts`：`createBuildrBridge` 增加可选 `recover` 钩子；development 渠道 `instance-mismatch` 时调用后进入既有轮询，轮询中持续 `instance-mismatch` 视为恢复进行中，受同一 deadline 限制（验证：`bridge.test.ts` 新用例——先 mismatch 后 ready 的序列返回 ready）。
- [x] 2.2 `process.ts`：development 渠道实现 `recover`，经 `channelCommand` 取得登记入口后 `spawn` detached 执行 `web --replace-mismatched-development --no-open`；`createInstalledBuildrBridge`/`createDiscoveringBuildrBridge` 接线，npm 渠道不提供 recover（验证：bridge.test.ts 用注入 spawn 断言参数与 detached；npm mismatch 仍返回原诊断）。
- [x] 2.3 恢复失败的诊断：`recover` 抛出或恢复后超时返回明确错误，不吞掉原 `instance-mismatch` 语义（验证：bridge.test.ts 断言 recover 抛错时返回带原因的错误而非通用 operation-failed）。

## 3. 回归与知识校准

- [x] 3.1 运行受影响测试集：`dsh-plugin` bridge 单测、`buildr` 的 `buildr-web-runtime.test.ts` 与 `npm-launcher.test.ts` 相关集（验证：全部通过）。
- [x] 3.2 校准受影响知识文档：`knowledge/docs/flows/dsh-plugin-release.md` 中入口恢复行为描述按最终实现更新；`.buildr/knowledge-impact.yml` 按需登记（验证：文档与实现一致）。
- [x] 3.3 真实开发渠道冒烟：改动后的入口在旧实例不匹配场景完成一次「退出+重启+打开」，`installation status` 报告「开发来源匹配：匹配」（验证：人工或脚本观察，结果写入任务）。
