## 1. 术语与兼容基线

- [x] 1.1 建立非归档当前源资产 inventory，按公开命名、代码命名、wire/schema、environment provider、SQLite/persistent identity、publication enum、Bundle Identifier 分类，并记录每项处理决定。
- [x] 1.2 更新当前 canonical OpenSpec capability 目录、引用和 Change delta，确保 archive 路径与历史正文完全不变。
- [x] 1.3 更新 Product current knowledge、AGENTS/rules 与术语治理引用，明确 Buildr Web 分层术语和保留兼容身份。

## 2. Buildr Runtime 与 CLI

- [x] 2.1 将 CLI help、command catalog、错误诊断、runtime/instance/health 公开说明和源码测试标题统一为 Buildr Web Runtime。
- [x] 2.2 将 preview lifecycle、Task Environment provider 的显示 label 和文档统一为 Buildr Web Preview，同时保留 `local-app-preview` 与 `BUILDR_LOCAL_APP_PREVIEW` reader/provider identity。
- [x] 2.3 将 Buildr Web publication platform canonical writer 改为 `buildr-web`，为旧 `local-app` reader 增加兼容解析、展示映射和 fail-closed 测试。
- [x] 2.4 将开发 Launcher Bundle Identifier 迁移到 Buildr Web canonical identity，并实现旧 Bundle Identifier 的 ownership-aware 识别、停止和清理兼容。
- [x] 2.5 更新 Buildr Runtime/Launcher/Task Finish/Bootstrap Skill runner 的阶段名、路径说明和错误文本，保留必要的旧结果 code reader 兼容。

## 3. Buildr Web Frontend 与验证

- [x] 3.1 更新 buildr-web 页面标签、platform 映射、组件说明和前端测试为 Buildr Web 分层术语。
- [x] 3.2 更新 Browser smoke 入口、selector dispatcher、verification registry、验证标题和诊断；保持独立 Workspace/Data Root、随机 loopback、串行 Browser capacity 与 web-dist 只读边界。
- [x] 3.3 更新 package scripts、静态验证、路径引用和相关 test fixture；确认旧兼容 identity 只在允许的协议/环境测试中保留。

## 4. 文档与资产收敛

- [x] 4.1 更新当前 docs、README/AGENTS、architecture、Service knowledge、Skill 文档和产品说明中的旧公开命名。
- [x] 4.2 更新当前 OpenSpec source spec 文件名和交叉引用为 Buildr Web 术语；不修改 `openspec/changes/archive/**`。
- [x] 4.3 为保留的 schema、provider、environment、SQLite/persistent identity、publication reader alias 和旧 Bundle Identifier 增加兼容清单与残留扫描白名单。

## 5. 验证与收尾证据

- [x] 5.1 运行 OpenSpec strict validation、convergence preflight、terminology/current-knowledge reconciliation，并修复非归档引用缺口。
- [x] 5.2 运行 affected static/unit/system tests、Buildr Web build/web-dist verification 和 Browser smoke；确认无真实 Workspace/其他 Task 资源副作用。
- [x] 5.3 对 archive 与当前源资产分别扫描，输出旧命名残留报告、兼容标识报告、Git diff/stat 和验证结果，供 Completion Review 使用。
