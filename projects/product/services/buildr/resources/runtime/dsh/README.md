# Buildr DSH 桌面入口

本目录维护 Buildr 的 DSH 插件（Plugin）源资产。主机端（Host）只通过 `createInstalledBuildrBridge` 读取绑定安装的公开健康状态或静默启动；客户端（Client）只注册官方已发布的侧栏底部动作席位（Seat）`sidebar.footer.action`，显式挂载生成的远程调用（Remote RPC）描述，并控制右侧浏览器。

## 兼容与权限

- 编译依据为官方 DSH `0.1.7-rc.2`、提交 `477b4f420553e8a52c2fbccc464d7561b239c443` 的**未修改源码**。该版本侧栏本就声明 `sidebar.footer.action`（`replaceRisk: none`，位于 Settings 旁），因此不需要任何 DSH 源码补丁。版本相同不代表席位（Slot）已存在；缺少该席位时显示兼容提示，不替换侧栏、不移动到错误位置。
- 该席位下发 `{ wide }`；主页面选择通过全局标准属性（`GlobalStandardProps.usePanelInfo`，由布局包声明）读取，不依赖本席位额外下发。
- 仅当桌面载体 `globalThis.dshDesktop.protocolVersion === 1` 且存在 `browser` 时允许打开。网页版不承诺支持，不改变 Buildr 的禁止内嵌框架（iframe）响应头。
- 没有已挂载会话（Session）或选中全局主页面时不启动、不创建会话、不切换主页面。等待期间任何会话或主页面切换都会撤销本次界面打开意图。
- 每次有效点击都重新查询公开健康地址，并发点击共享本次查询。健康地址未变时，已拥有的浏览器标签页（Tab）只执行 `focus` 和必要的 `toggleExpanded`，不导航、不刷新；地址变化时保留旧页及未保存内容，用 `openTab` 新开正确地址并更新本插件的页面记录，后续稳定地址只展示新页。
- 若用户在健康查询等待期间关闭本次观察到的原标签页（Tab），本次打开取消，不擅自重新打开。之后主动再次点击才按新的健康查询打开。
- 本版标签页身份缓存只覆盖当前插件生命周期；禁用再启用、客户端重载或重启后不保证识别之前的 Buildr 标签页。不会猜测其他浏览器标签页的归属，也不读取宿主私有存储。
- 禁用或卸载撤销远程命名空间（Remote Namespace）、席位注册和观察订阅，取消本插件等待；不关闭已有 Buildr 页面、不删除数据、不停止已运行服务。

## 构建与交付

从 Buildr 服务（Service）根执行普通 Node（不可用签名 DSH Node 加载开发原生依赖）：

```sh
node tools/dsh/build-plugin.ts [准确的DSH源码目录]
node --test test/unit/dsh-client.test.ts
node tools/dsh/verify-plugin.ts [准确的DSH源码目录]
```

默认 DSH 源码位置是忽略目录 `build/dsh-upstream`。构建需要该 SDK 的已安装开发依赖，以及其正式生成的主机端远程描述文件；会增量编译所需客户端声明。此步骤是隔离的 SDK 源码构建，不是 Buildr 普通构建的隐式前置条件，也不是纯 npm 依赖可重建的承诺。工具本身是 Node 原生执行的 TypeScript；仅隔离加载 DSH 上游编译工具时使用该 SDK 自带的 `tsx`。

构建输出位于忽略目录 `build/dsh-plugin`，包含模块工厂格式的客户端（Client）、真实 Typert 生成的主机端及远程描述、类型声明、说明与许可证：

```text
package.json
cordis.patch.yml        # 通过 insert 新增禁用的未绑定插件条目
lib/index.js
lib/client.js
lib/typert.host.js
lib/typert.remote-client.js
lib/types/
lib/README.md
lib/LICENSE.Buildr.txt
lib/LICENSE.zod.txt
```

正式运行不需要开发 SDK 源码目录。组合包（Bundle）为私有候选，不包含安装脚本；未绑定包不能报告为已激活。包补丁使用 `insert` 新增 `buildr` 条目；顶层仅有 `id`、`name` 的补丁只会覆盖已存在条目，不能完成首次安装。

安装准备由 `buildr runtime dsh-plugin prepare --channel npm|development --output <新目录> --json` 生成本机绑定配置。安装、禁用和卸载只使用返回的 DSH `plugin_manager` 参数，不直接写配置档（Profile）、应用安装包或启动另一 DSH。包准备成功、真实装载器（Loader）测试通过与真实桌面验收是独立证据。

## 验证边界

独立测试覆盖并发复用、会话变化、全局页面变化、无会话、网页拒绝、健康地址变化、失败重试和退出。组合验证从产物声明的 `dsh.bundle.patch` 读取真实包补丁，经官方 `applyEntryPatches` 合成为条目后交给真实 Cordis 装载器（Loader），验证新增禁用条目及隔离激活；同时使用 Typert 网关（Gateway）、生成的远程调用（Remote RPC）描述、席位注册器（Slot Registry）及 React 界面渲染；只替换外部传输和测试会话现场，不启动网络服务。

这些检查不证明当前已安装 DSH 已更新，也不证明真实桌面网页视图（WebView）能够加载 Buildr。真实按钮位置、深浅主题、折叠动画、页面正常导航和安全响应头兼容仍须在用户安排的匹配桌面构建中验收。
