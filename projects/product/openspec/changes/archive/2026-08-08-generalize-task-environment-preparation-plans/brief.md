# 通用化 Task Environment 准备计划

## 一句话摘要

由 Agent 为当前正式 Task 声明多 Service、多步骤的环境准备计划，Task Environment 只负责受控执行、持久化、恢复和只读检查。

## 背景与问题

现有实现通过 Product `task-environment.yml` 写死npm dependency roots与Service依赖闭包，虽然解决了buildr/buildr-web漏装依赖，却要求Buildr核心预先适配技术栈，并把Agent应做的当前Task判断转移给静态Project配置。

## 目标与非目标

- 目标：Agent登记Plan；Environment按Service/Step执行并形成可信ready；缺失声明、漂移或失败时fail closed。
- 目标：保持SQLite current唯一authority、inspect只读、Local App只读saved current及既有provider/cleanup边界。
- 非目标：不建设通用package-manager adapter、仓库递归扫描、后台调度器或第二个Environment store。

## 受影响用户或角色

- Agent：负责根据Task scope、源码、构建和验证事实形成Plan。
- Buildr使用者：通过Environment current和Local App看到可诊断的Service/Step状态，无需预配置全部技术栈。

## 核心流程

1. Agent读取Task与代码，形成或更新Environment Plan。
2. Agent通过Plan record或`prepare --plan`登记。
3. Task Environment校验execution roots和Step边界，执行required Steps并逐步保存事实。
4. `inspect`只比较Plan、工具/输入identity和本地输出；漂移由后续prepare恢复。

## 关键变化

- Receipt v4和public Result v3从dependency roots改为Plan/Service/Step。
- 新增Plan record/inspect及`prepare --plan`。
- 删除Product `task-environment.yml`和npm专用declaration parser。
- Buildr/buildr-web变成通用Plan的自举实例，而不是核心特殊规则。

## 影响、风险与兼容性

- 旧v2/v3 Environment只读兼容；active legacy receipt需Agent显式Plan升级。
- Agent选择命令带来执行风险，因此禁止shell/env/secret字段，限制cwd、输入与输出在Service root，并记录executable identity。
- 绝对executable是机器本地事实，符合Environment current的机器作用域。

## 验收摘要

- 多Service、多Step、not-applicable、非npm命令、partial restore、drift和failure均有自动化证明。
- fresh Buildr Task在无node_modules时一次携带Plan的prepare可准备buildr/buildr-web并成功`npm run build:web`。
- inspect和Local App GET均不执行或修复步骤。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs)
- [Implementation tasks](tasks.md)

