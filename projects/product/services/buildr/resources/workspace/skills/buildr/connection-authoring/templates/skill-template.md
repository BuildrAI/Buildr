---
name: company-example
description: 使用组织示例系统的真实专业能力时使用；制作后替换为明确目标和边界。
connectionDefinitions: [assets/connection.yml]
---

# 组织示例接入

本模板尚未实现真实系统业务能力。`test/discover` 仅验证模拟上下文（Context）并提供固定示例选项；不能表述为真实登录或连接成功。根据真实系统维护适用目标、对象定位、专业命令、授权与副作用、成功失败未知判断、版本保护和接续方法。不得在正文加入真实实例配置或密码。

完整源目录使用 `skills/connections/company-example/`，由 `skills/manifest.yml` 登记 `path: connections/company-example`；通过现有技能（Skill）登记和投射机制启用，目录本身不自动生效。

按 [命令与结果](references/commands-and-results.md) 执行无认证离线检查，或使用虚构实例经 Buildr 运行只读测试和发现。帮助使用 `buildr connection-skill help --connection <id> --program cli`；真实专业操作实现后通过通用 `run` 将专业参数交给所选程序。

需要持续集成与交付（CI/CD）等专业操作时，在声明中增加实际程序并通过通用 `buildr connection-skill run` 调用，按该系统说明对象定位、授权、结果核验和未知结果调查。不依赖服务本地运行模块提供部署入口，不保留未实现的专业程序。

先用 `list`、`get --connection <完整id>` 核对绑定来源、目标范围和用途，运行使用该 `id` 与刚读取的 `revision`。同类或同目标连接有多个同等候选时请用户明确选择，不按列表顺序取第一个。文件名由 Buildr 生成，实际位置取 `sourcePath`，不手拼路径或用文件名选择认证。

交付前选一个声明支持的用户场景：说明如何从用户提供的业务线索找到准确对象、明确所选连接、使用专业命令并核验结果；多个候选或必要输入不足时如何判断也须可接续。用两条同类同目标、不同 `id` 的模拟实例确认配置、认证与观察版本（Observed Revision）不串用。有独立智能体（Agent）可用时按方法独立执行，记录真实、模拟及未验证范围，不用帮助或登录成功替代场景完成。
