# 实施清单

## 1. 批次同步动作

- [x] 1.1 在 `services/buildr-web/src/features/code/hooks/useSourceControlSync.ts` 增加 `runAll(repositories)`：按已观察清单顺序遍历每个代码库的工作树，过滤既有可同步条件（已就绪、非离线、有 `gitId`/`checkoutId`、有本地分支、有提交、已确认远端跟踪分支），不满足条件的对象写入带真实原因的不可用结果条目后跳过，满足条件的逐个 await 既有单条执行体；维护批次等待标记并在代码库在途写入时跳过该对象。验证：TypeScript 类型检查通过，单条 `run` 行为不变。

## 2. 目录菜单入口

- [x] 2.1 在 `services/buildr-web/src/features/code/pages/CodeSourceControlPage.tsx` 的源代码管理目录操作菜单中、紧邻“全部获取远程”新增“全部同步”项（`SyncOutlined` 图标、可访问名称、键盘可达），点击后对当前 `observation.repositories` 快照调用 `runAll`，菜单项在批次执行中或无可同步对象时禁用并表达等待。验证：页面编译通过，目录菜单出现两个批次入口且互不串扰。

## 3. 验证

- [x] 3.1 执行 `services/buildr-web` 的 TypeScript 检查与正式构建，确认无新增错误；通过受影响浏览器检查或手工场景核对：目录菜单“全部同步”按顺序逐工作树执行，不可同步对象保留原因，部分失败逐条通知，全部正常静默。

## 4. 当前知识

- [x] 4.1 核对 `knowledge/` 中受影响的地图与说明：`code-map/system-services-assets.md` 对代码模块职责的描述（同步应用职责不变，前端新增批次编排）如仍准确则标记 aligned；若描述失真则按当前事实更新对应条目。
