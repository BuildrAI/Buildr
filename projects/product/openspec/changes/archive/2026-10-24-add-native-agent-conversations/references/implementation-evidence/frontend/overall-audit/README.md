> 历史讨论与实验记录：保留原结论和当时边界。实现现状以正式规范、当前架构说明及交付报告为准；一次性附件和运行资源已在本次交付清理，不作为当前运行依赖。

# 原业务整体审查证据

本轮使用 `frozen-web-dist`，入口 `/assets/index-pbPNDNk-.js`。后续根代理的新权限界面构建不属于本轮验收对象。所有浏览器检查经服务保留 Node/npm 与隔离工作空间 runner 执行，最多两路并发；没有改正式源码、默认预览、真实账号或 canonical 工作空间数据。

## 覆盖

- 服务：整套 13/13（含父测试），真实服务运行、日志、问答和资料阅读通过。
- 项目：整套原先 11 个子用例通过，项目组成用例因旧导航入口失败；仅补实际 hover→可见二级菜单，原用例独立复测 2/2（含父测试）通过。
- 工作台：整套原先 11 个子用例通过；概览与偏好两个用例仍读取默认折叠的旧导航 DOM。仅补真实 hover、可见链接等待、Escape 后，两个业务用例分别通过。
- 任务：整套 41 个子用例通过、2 个子用例失败；两个失败再次 focused 复现，DOM/几何和截图已保存。
- 源代码管理：9 个有意义的既有用例，6 个在原执行或导航修正复测中通过；3 个受基线已退役 staged/unstaged UI 限制。没有放宽断言假称通过。

## 需要区分的失败

1. **真实窄屏问题**：390px 时一级图标栏45、主内容345、右工作屏297、子任务表247。标题列45，左右 padding 合计36，实际正文空间9。状态与操作均未重叠、页面无横向溢出，但任务标题几乎不可读。截图 `task-focused/composite-task-children-failure-390.png`。
2. **既有规则与旧测试契约不符**：文章草稿从 Codex hash 入口导航到同工作空间任务时，当前 `ArticleEditorPanel` 的 location-key blocker 显示离页确认；原 URL 和 textarea 草稿完整保留，任务没有挂载。该源本轮无修改。测试期望同工作空间自由切换，当前源不保证这一行为。截图 `task-focused/codex-draft-fragment-failure.png`。不能定性为本轮丢稿或任务入口随机失败。
3. **基线测试陈旧**：源代码管理基线提交 `5b7dfb18f` 已统一为 `data-change-area="working"` 和上次提交→当前文件。原脚本仍查 `staged/unstaged` 并要求 index 比较语义。失败现场实际 main.ts/history.ts 与差异均可见，API 也有对应变化；不是读取或导航丢失。需要单独调整旧测试设计，不能仅换 selector。

## 文件与执行

`verification.json` 保存逐次执行、清理、错误数、修改脚本内容哈希与覆盖说明。`failure-scenes.json` 保存真实失败 DOM、API 与几何；`logs/` 保留首轮及所有 focused 复测失败。`focused-runner.mjs` 仅用 Node 原生 skip-pattern 选择原业务 test callback，不改 fixtures、断言、超时。

本轮修改仅限 8 个既有测试文件：真实导航适配，或失败 catch 中诊断和截图。语法检查与这些文件的 diff whitespace 检查通过。没有执行正式源码修复。

## 窄屏修复后的独立复测

根代理修复组合子表后，用新的正式前端入口 `/assets/index-CrAP_Seo.js`，只重跑原组合任务子用例。2/2（含父测试）通过，页面错误0，隔离实例清理完成。390px标题列81px、操作列100px，状态/操作不重叠、无页面横向溢出；六条排序与解除关联保留状态/结果的原断言全部通过。详情见 `composite-final/verification.json` 和 `composite-final/composite-task-children-390.png`。

此复测也保留了两次更早失败：表头先显示但异步子任务未就绪，以及 ResizeObserver 响应式列配置落地前读到0、紧接DOM已81的过渡。测试现等待准确业务子任务行及对应容器/列配置落地，未增加固定延时、超时或放宽几何断言。旧快照下的失败记录没有覆盖。文章离页保护与三项旧SCM测试仍明确未解决。
