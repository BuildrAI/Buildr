---
name: company-example
description: 使用组织示例系统的真实专业能力时使用；制作后替换为明确目标和边界。
connectionDefinitions: [assets/connection.yml]
---

# 组织示例接入

本模板尚未实现业务能力。根据真实系统维护适用目标、对象定位、专业命令、授权与副作用、成功失败未知判断、版本保护和接续方法。帮助先用 `buildr connection-skill help --connection <id> --program cli`；实际操作通过通用 `run` 将专业参数交给所选程序。不得在正文加入真实实例配置或密码。

完整源目录使用 `skills/connections/company-example/`，由 `skills/manifest.yml` 登记 `path: connections/company-example`；通过现有技能（Skill）登记和投射机制启用，目录本身不自动生效。

交付前选一个声明支持的用户场景：说明如何从用户提供的业务线索找到准确对象、明确所选连接、使用专业命令并核验结果；多个候选或必要输入不足时如何判断也须可接续。有独立智能体（Agent）可用时按方法独立执行，记录真实、模拟及未验证范围，不用帮助或登录成功替代场景完成。
