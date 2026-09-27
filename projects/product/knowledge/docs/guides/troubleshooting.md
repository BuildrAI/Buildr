# 排查问题

[阅读目录](../README.md) · [数据保全与升级](data-and-upgrades.md)

先确认实际版本、工作目录和正在使用的智能体（Agent）工具，再处理具体问题。可以把错误原文交给智能体（Agent），要求它保留现场、先调查原因；不要用删除整个 `.buildr/` 或重新初始化来“清空错误”。

## 从现象找入口

| 现象 | 先核对什么 | 下一步 |
| --- | --- | --- |
| 安装失败或不能启动 | 实际 Node.js 是否满足 `>=24.15.0 <25`；程序入口是否是预期安装 | [安装参考](../../../services/buildr/docs/cli-reference.md#首次使用) |
| 不知道装了哪个版本 | `buildr --version`；`buildr update check --json` 的实际结果 | 明确选择稳定轨道或候选轨道，不根据旧文档猜版本 |
| 工具看不到技能（Skill） | 目标工具参数、生成位置与工具要求的刷新条件 | [适配说明](../../../services/buildr/docs/agent-runtime-adapters.md) |
| 技能（Skill）不可用，无法自行维护 | 当前安装及目标目录是否明确 | 运行 `buildr bootstrap guide` 获取随包恢复说明 |
| 页面看不到资料或任务（Task） | 当前工作空间（Workspace）、筛选条件、资料是否已经登记、记录是否在这台机器上 | 核对真实文件和本机记录；换机器不会自动带来任务（Task）历史 |
| 知识页链接打不开 | 文件是否存在；当前查看的是文件、图源还是 HTML 展示 | 返回[阅读目录](../README.md)定位唯一正文；GitHub 不直接运行交互图 |
| 提交修改提示冲突 | 内容是否已被另一个入口修改 | 刷新并重读，再决定怎样合并；不要用旧版本覆盖 |
| 更新提示数据版本或迁移问题 | 是否有升级前副本；当前数据库与程序版本是否匹配 | 停止继续写入，按[升级与恢复](data-and-upgrades.md)保留并核对 |
| 关闭浏览器后应用仍在运行 | 浏览器页面和本机进程是不同对象 | 通过页面“退出 Buildr”停止；进程异常时先核对实际归属 |
| 更新后页面仍旧 | 是否仍在使用旧进程或另一个安装的启动器（Launcher） | 核对版本和安装身份，正常退出旧实例后打开预期安装 |
| 发布或交付部分成功 | 哪些结果已由 Git 或目标平台确认 | 保留已成立结果，仅恢复剩余步骤，不重复发布 |

## 最小检查

已初始化的工作空间（Workspace）可以让智能体（Agent）运行：

```text
buildr doctor --agent <实际工具参数> --target <工作空间绝对路径> --json
```

参数来自 `buildr runtime list --json`，不要直接照抄占位符。检查结果只证明它实际观察到的范围；文件生成成功不证明工具已经加载，检查通过也不证明某项工作已经完成。

针对错误给出的修复建议，应先核对实际对象与授权。来源内容、投射目录或安装归属不清时保留文件；不要手工改写受管输出去掩盖源文件问题。

## 提供有用的反馈

向[GitHub Issues](https://github.com/BuildrAI/Buildr/issues)反馈时，包含：

- 操作系统、Buildr 与 Node.js 版本、使用的工具。
- 想完成的目标和操作步骤。
- 期望结果、实际结果及错误原文。
- 是否首次安装、从哪个版本升级，以及是否可在无敏感数据的目录复现。

先移除令牌（Token）、实例密钥、个人路径与业务内容。疑似安全漏洞按[安全报告（GitHub）](https://github.com/BuildrAI/Buildr/blob/main/SECURITY.md)私密提交，不在公开问题中附可利用细节。

本页依据[命令参考](../../../services/buildr/docs/cli-reference.md)、[已知限制](../../../services/buildr/docs/known-limitations.md)、[本机数据说明](../architecture/buildr-data-design.md)和[启动入口](../../../services/buildr/src/web/interfaces/cli/web.ts)。
