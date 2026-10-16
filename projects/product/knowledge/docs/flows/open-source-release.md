# Buildr 发布

**固定候选 → 跑测试 → 打包 → 验包 → 发布。** 本页是唯一发布流程入口；准备停在公开之前。

## 谁负责

![发布代码归 buildr-release，检查归验证框架](../../archify/flows/release-architecture.html)

智能体（Agent）按 `buildr-release` 推进工作，人决定目标和公开授权。**发布流程与发布专用代码归 `buildr-release`，作为技能（Skill）随附脚本；全部检查归验证框架。** 本机与 GitHub 共用同一份代码和检查定义。

## 怎么发布

![固定候选、跑测试、打包、验包、发布](../../archify/flows/release-workflow.html)

1. **固定候选**：固定包、独立版本、分支（Branch）、准确提交（Commit）和对端；后续 `dev` 不自动进入。
2. **跑测试**：验证框架采用有效旧结果，只执行缺失或失效的检查，包括发布工具自身的检查。
3. **打包**：每个包生成一份准确原包；测试或汇总修复不默认重打，产品或构建输入变化才重打相关包。
4. **验包**：验证同一原包的安装、启动、核心页面及必要平台／插件组合；确认必需检查齐全。使用 `prepare --stop-after candidate` **停在验包**；继续发布时再核对同树 `main`、准确对端和顺序。
5. **发布**：获得准确内容的授权后，通过受保护工作流（Workflow）公开已验原包并回读官方结果；不重新生成“交付版”。

## 执行与恢复

- 本机能充分证明的在本机完成；GitHub 只补必要平台、干净环境和受保护执行条件。无依赖项可以并行。
- 有效结果保留，只补相关缺项。检查失败补检查，汇总失败补汇总；请求未知先回读。共享准备不能共享被案例改过的数据。
- 公开后的任务登记、引用清理、独立自举分别接续，保留已完成的公开事实；自举只交给 `buildr-self-bootstrap-sync` 唯一执行器。

发布代码位于工作空间根的 `skills/buildr-release/scripts/`：[主入口](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/release-orchestration-runner.ts)、[主包打包](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/candidate-package.ts)及[插件发布](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/dsh-plugin/release.ts)；[插件检查](../../../services/dsh-plugin/tools/verify-all.ts)仍归验证工具。从 `services/buildr` 经 `tools/development/run-development-node ../../../../skills/buildr-release/scripts/release-orchestration-runner.ts --help` 查看参数：`prepare` 准备、`inspect` 只读逐包运行状态、`publish --authorized` 公开获准内容、`resume` 回读后接续。正式补验绑定 `--verification-source`，不赋予补验代码公开权限。插件细节见[插件说明](dsh-plugin-release.md)。

[检查明细与工程核对底稿](../architecture/verification-framework.md)记录输入、结果复用、工具自验与剩余候选缺口。两组重复 OpenSpec 包装检查已退出默认候选，定向入口仍保留；源码准备按真实缺项选择，当前清理失败保留原有效结果。局部检查通过不表示完整候选通过。
