# DSH 桌面接入

Buildr 产品包负责本机安装身份、启动器（Launcher）、健康状态和业务数据。独立的 DSH（DeepSeek Harness）插件（Plugin）服务（Service）负责桌面侧栏按钮及右侧浏览器。源码、构建和发布流程见[插件服务说明](../../../services/dsh-plugin/plugin/README.md)与[独立发布流程](../../../knowledge/docs/flows/dsh-plugin-release.md)。Buildr 主包不包含插件，也不提供正常安装所需的 `buildr runtime dsh-plugin prepare` 命令。

正式插件 `@buildr-ai/dsh-plugin` 发现本机 npm 安装的 Buildr；开发版 `@buildr-ai/dsh-plugin-dev` 独立发现源码开发入口，两者互不回落。公开发布后的正式版可由智能体（Agent）通过 DSH 插件管理器安装。当前包仍须以 npm 注册表（Registry）的实际公开状态为准，不能把本机构建或候选包视为已发布。

插件在有效对话会话（Session）中点击时查询对应 Buildr 的健康地址。地址未变时，优先聚焦本入口创建、仍存在的右侧标签页（Tab）；DSH 重启后可按本机记录复认。地址变化时另开正确地址并保留旧页面。DSH 公开标签清单未提供当前网址，所以无法安全认领用户手动打开的 Buildr 页面，或识别插件标签后来被导航到其他网站。

网页端不提供桌面侧栏入口，不调整 Buildr 的禁止内嵌框架（iframe）响应头。真实桌面位置、交互和跨重启复用以用户在匹配 DSH 版本上的验收为准；构建和隔离装载测试不能代替该验收。
