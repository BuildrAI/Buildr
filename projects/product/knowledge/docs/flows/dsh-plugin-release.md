# Buildr DSH 插件独立发布

DSH（DeepSeek Harness）插件（Plugin）由独立服务（Service）`projects/product/services/dsh-plugin/` 维护。Buildr 主包不再包含插件包，也不要求软件开发工具包（SDK）作为主包候选输入。插件版本只在插件源码、兼容基线或交付契约变化时更新；Buildr 主包单独变化时复用已公开的插件版本。

## 版本与候选

在插件服务根目录，以 `.node-version` 指定的 Node 执行：

```sh
node tools/release.ts status
node tools/release.ts prepare <verified-dsh-sdk-dir>
```

`status` 对照插件版本、最近的 `dsh-plugin-v*` 标签、插件服务路径的源码变化和 npm 注册表（Registry）的公开版本，给出 `not-public`、`changes-pending` 或 `up-to-date`。注册表查询失败会报错，不推测“已发布”。准备命令要求插件源码已提交且该版本尚未公开；它构建、用真实 DSH 装载器验证，并对预编译目录执行一次 `npm pack`。`build/release-candidates/<version>/candidate.json` 记录准确提交、服务源码树、SDK、压缩包路径和 SHA-256；候选目录已存在时拒绝覆盖。

压缩包必须只含预编译插件、默认启用的组合补丁和许可文件，不含本机路径、凭证或安装脚本。正式版包名是 `@buildr-ai/dsh-plugin`。开发版变体 `@buildr-ai/dsh-plugin-dev` 仅在开发者机器构建、安装，不公开发布。

## 发布与安装

公开 npm 发布和 `dsh-plugin-v<version>` 标签属于插件自己的版本事实，需针对准确版本、源码和同一候选字节单独取得发布授权。候选生成不等于公开发布。发布失败、尚未授权或注册表仍不可见时，不能承诺用户已经能一句话安装。

公开后，智能体（Agent）在目标 DSH 配置档（Profile）中使用 DSH 插件管理入口安装 `@buildr-ai/dsh-plugin`。桌面版 `desktop` 配置档由 Electron 应用独占管理，须经应用的插件界面或其受支持的插件管理能力安装；`dsh plugin --profile desktop add` 会被拒绝，不能作为桌面安装命令。其他非受管配置档可使用 DSH 命令行插件管理入口。预编译包不需要 `prepare` 安装钩子，也不需要先运行 Buildr 命令。更新已加载的同版本包后应完整重启 DSH，再验收按钮、右侧页面和重复点击；“立即启用”不证明宿主进程已换用新模块。若需要临时验证，可将候选 `.tgz` 装入隔离配置档；不得把隔离结果写成真实用户桌面验收。

验收跨重启标签复用时，分别检查标签数量与网页内容：当前 DSH 会保留浏览器标签，但页面需用户点击「恢复页面」或刷新后加载。Buildr 插件只聚焦已复认标签；不能把未自动加载说成标签复用失败，也不能为消除恢复提示而无条件刷新可能含未保存内容的页面。

Buildr 主包发版准备时先运行插件 `status`。若 `changes-pending` 或 `not-public`，先准备插件候选，分别记录插件与主包的发布授权及结果；无变化时无需重建或重发插件。卸载由 DSH 管理，不触碰 Buildr 数据。
