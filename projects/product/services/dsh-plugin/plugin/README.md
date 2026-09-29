# Buildr DSH 桌面插件

本插件（Plugin）在 DSH（DeepSeek Harness）桌面版侧栏底部提供 Buildr 按钮。点击后，主机端（Host）发现本机 Buildr、查询健康状态，客户端（Client）在右侧浏览器打开页面。正式版包 `@buildr-ai/dsh-plugin` 只服务 npm 安装的 Buildr；开发版包 `@buildr-ai/dsh-plugin-dev` 只服务本机源码，两者可共存。

## 兼容边界

- 当前编译基线为 DSH `0.2.0-rc.1`。构建器（Builder）核对源码提交和版本；DSH 升级后须重新验证兼容性。
- 使用 DSH 公开的 `sidebar.footer.action` 席位（Seat）和桌面浏览器接口。网页版不支持此入口，Buildr 的禁止内嵌框架（iframe）响应头保持不变。
- 当前会话（Session）不存在或选中全局面板时，不创建会话、不切换主页面。点击期间切换现场会取消打开。
- 每次点击重新查询 Buildr 健康地址。相同地址优先聚焦本入口创建、仍存在于当前会话的标签页（Tab）；客户端重载和 DSH 重启后也按记录复认。正式版和开发版分别记录。地址变化时保留旧页并另开新页。
- DSH 公开标签列表不提供浏览器当前地址，因此不能可靠认领用户手动打开的 Buildr 标签，也不能识别插件标签后来被导航到其他网站。本机存储不可用时，跨重启复用不可用。
- 禁用或卸载只撤销插件贡献，不关闭现有页面、不停止 Buildr、不删除其数据。

## 构建与安装

从本服务（Service）根目录执行精确 Node 版本；软件开发工具包（SDK）路径必须是已核验的 DSH 基线：

```sh
node tools/build-plugin.ts <verified-dsh-sdk-dir>
node tools/verify-plugin.ts <verified-dsh-sdk-dir>
npm pack ./build/dsh-plugin --pack-destination ./build
```

输出压缩包（Tarball）只有预编译主机端、客户端、类型、组合补丁、说明和许可证。`cordis.patch.yml` 以 `insert` 注册默认启用的 `buildr` 条目；没有本机绑定、凭证、安装脚本或 TypeScript 源码。公开 npm 发布后，在 DSH 桌面版的插件界面输入 `@buildr-ai/dsh-plugin` 安装，或由智能体（Agent）调用 DSH 受支持的桌面插件管理能力。桌面 `desktop` 配置档（Profile）由应用独占管理，`dsh plugin --profile desktop add` 会被拒绝；命令行插件管理只适用于其他非受管配置档。

发布前可把生成的 `.tgz` 安装到隔离的 DSH 配置档（Profile）验证。安装、禁用和卸载由 DSH 插件管理器完成；正常用户安装不需要 `buildr runtime dsh-plugin prepare`。开发版在同一根目录使用 `node tools/build-plugin.ts --dev <sdk-dir>` 单独生成，不向公众发布。

构建、装载器（Loader）验证、安装、真实桌面验收是不同证据；更新同版本包后应完整重启 DSH，再确认真实按钮与页面行为。
