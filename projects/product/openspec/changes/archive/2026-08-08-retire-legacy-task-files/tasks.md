## 1. 退出旧文件输入

- [x] 1.1 删除旧 v1 receipt migration 与 Environment current file importer、runtime 注册及 sync 调用，确保正常产品路径不再扫描旧 environment authority
- [x] 1.2 删除或改写两条 migration 的专用测试与静态断言，并增加 sync 不依赖旧目录的回归覆盖

## 2. 收敛产品契约与资产

- [x] 2.1 更新 Task Environment capability contract、source Skill、package/runtime 投射资产与 CLI/架构说明，使 Environment locator 只指向 Workspace SQLite
- [x] 2.2 删除本自举 Workspace 中 Git 已跟踪的遗留 Task YAML，同时保留 `/.buildr/tasks/` ignore 兼容护栏
- [x] 2.3 创建并核对 Change Brief、knowledge impact 与术语影响，不新增目录清理 framework 或第二 authority

## 3. 实现反馈与归档准备

- [x] 3.1 运行 OpenSpec strict validation、受影响测试与 package/static feedback，修复所有回归
- [x] 3.2 核对 importer、文件 authority 文案和已跟踪 `.buildr/tasks/` 残留均已退出，并完成 Change archive readiness 检查
