## Why

用户要求更新 Buildr 后自动采用新版 Buildr Web。目前更新只安装软件包并要求再次打开启动器（Launcher），把确定性的版本交接留给用户，也容易误把安装成功理解为运行版本已更新。

## What Changes

- npm 安装更新成功后，自动核对正在运行的实例；对同一安装槽位（Installation Slot）的旧版实例启动新版独立进程完成交接，无需手动打开启动器（Launcher）。
- 复用安装登记、精确 Node.js 和软件包入口、实例启动锁、认证退出和健康检查；支持由命令行或启动器（Launcher）启动的旧版，不要求新增启动器（Launcher）。
- 没有运行实例时不额外启动；开发版与其他安装实例不被停止。分别报告软件包更新与网页切换结果，失败时保留已成立的安装成功事实。
- 同步中英文 README、更新参考与随包技能（Skill）指引。正常退出可能取消旧服务中未完成的生成，不承诺不中断。
- 不改变更新轨道、安装位置或工作空间（Workspace）同步边界；不新增依赖、持久状态或破坏性数据迁移。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-cli-self-update`：npm 更新自动交接同一安装中正在运行的旧版网页，并分别表达安装和切换结果。
- `buildr-web-instance-lifecycle`：由唯一生命周期实现校验并执行更新后的同安装实例替换。

## Impact

影响 `services/buildr` 的安装更新、安装身份判断和网页实例生命周期，以及对应隔离测试、知识说明和技能（Skill）源文件。沿用现有 HTTP 认证退出，不新增 HTTP 接口或前端交互；开发版正式激活仍由既有唯一执行器负责。
