---
name: independent-local-inspector
description: 在隔离测试中读取本机业务输入并核验已选连接上下文；拒绝外部访问、部署、发布及其他写入。
connectionDefinitions: [assets/connection.yml]
---

# 本机未知系统接入样例

本技能（Skill）是依据 `connection-authoring` 指引独立制作的验收样例，不是正式外部系统适配。类别（Category）为 `local-inspection`，专业程序提供 `inspect/check-context` 与模拟 `test/discover`，Buildr 核心无需认识这些专业动作。

通过现有 `skills add --source` 登记完整目录，再从 `connection-skill definitions list` 选择精确身份及来源。帮助来自本目录的 `scripts/client.mjs`，依赖产品 Node.js 基线。程序从私有进程间通信（IPC）取得完整所选认证组，专业标准输入（Standard Input）保留业务数据，不打印密码或访问真实系统。

专业用法与验证依据见[方法与结果](references/commands-and-results.md)。源制作、真实登记、程序执行和真实业务能力分别报告；本样例只能证明前几项，不证明外部业务。实际团队或个人认证不写入本技能源。
