> 历史讨论与实验记录：保留原结论和当时边界。实现现状以正式规范、当前架构说明及交付报告为准；一次性附件和运行资源已在本次交付清理，不作为当前运行依赖。

# DSH 全新登录与冷恢复实验

此处只包含隔离实验程序；不属于 Buildr 正式运行时（Runtime），不接管桌面客户端。

固定版本：DSH `0.2.1-rc.2`，客户端依赖版本见 `package.json` 与 `package-lock.json`。默认运行根为 `/tmp/buildr-agent-continuity-hCgJCw/dsh`。`DSH_PROBE_ROOT` 可替换私有运行根，`DSH_PROBE_DEPS` 可指向已经按锁文件安装依赖的目录；源码通过该目录解析官方包。

账号与设置目录为运行根下 `config`，原生会话目录为运行根下 `agents`，均由独立 Host 使用。程序从未读取或复制 `~/.dsh` 的账号授权。不要把这些私有运行目录复制到 Git。

`node login.mjs <cwd>` 从无账号开始，通过官方 `account.startSignIn` 发起浏览器登录。登录 URL 只写到私有 `login-private.json`（0600），由用户在浏览器完成；程序随后检查账号、资料和模型目录，并重启自己的 Host 再核验一次。中途退出 Host 无法恢复尚未完成的登录尝试，应重新发起。测试完成后只删除本实验的私有状态，不调用远程退出接口。

`node runner.mjs <request.json>` 的输入是 `{cwd, configDir, sessionId, prompt, outputFile, historyOnly?}`。每次调用启动独立 Host；`sessionId` 为空时创建原生会话，否则严格读取该编号及原始工作目录。`historyOnly: true` 只恢复读取，不执行模型。输出白名单字段包括原生会话编号、可见回复、历史记录数、结束状态与工具摘要，过滤模型推理与原生请求上下文。

只有共享的合成工作目录 `/tmp/buildr-agent-continuity-hCgJCw/workspace` 获得模型执行授权。会话上传在首轮前经官方设置关闭，额外权限请求默认拒绝。普通请求需要等待明确 `turn/end` 才记录完成；每次退出都关闭本次连接和 Host。程序不会重放历史工具命令，也不会在原生编号不存在时静默创建替代会话。

交接包、统一对话编号及增量游标由实验根协调器维护。此适配程序只保存和恢复 DSH 原生上下文，不能单独证明完整的跨智能体（Agent）交接通过。
