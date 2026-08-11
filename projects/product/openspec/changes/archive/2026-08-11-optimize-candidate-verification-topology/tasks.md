## 1. 当前认知与验证契约

- [x] 1.1 建立 Change brief 与 knowledge impact evidence，确认只影响产品验证流程和 Buildr Service 验证入口。
- [x] 1.2 更新 verification contract tests，使新 Host/managed Node 拓扑、System owner 完整性和 `main` 去重在实现前可失败。

## 2. Host Node 与 Candidate CI 拓扑

- [x] 2.1 新增直接使用 Host Node 的 compatibility profile/入口，覆盖 engines、tarball 安装、CLI 初始化/诊断和 Node 版本敏感边界。
- [x] 2.2 将最终候选 workflow 改为两个最低 Host Node + 完整受管 Candidate 作业，以及两个当前 Node 24.x compatibility 作业。
- [x] 2.3 保留 Windows 两版本平台预检，删除相同 `main` tree 的重复完整 Candidate，并保留独立 timing/diagnostics artifacts。

## 3. System owner 与测试文件拆分

- [x] 3.1 建立 System suite registry，逐文件声明唯一 primary owner、资源和 inner concurrency，并让直接 System runner 与 Candidate 共同消费。
- [x] 3.2 将 `workspace-product` 拆为 manifest/registry、runtime recovery、Local App HTTP、App process/preview 四个文件和无状态 helper。
- [x] 3.3 将 Candidate monolithic `system` step 拆成 verification contracts、Workspace lifecycle、runtime recovery、Local App HTTP、App process、Task Finish 和 fresh build owners。
- [x] 3.4 增加文件归属完整性、重复 owner、未知 profile/resource 和并行隔离回归测试。

## 4. 不可变 fixture 复用

- [x] 4.1 让 clean Candidate 的 fresh-build 测试直接复用已安装 controller；dirty 开发态仅物化已安装依赖的 clean snapshot，不执行额外 controller `npm ci`，并保留被测双 Service 安装与真实 `build:web`。
- [x] 4.2 复核 Task lifecycle baseline、Candidate tarball、Web dist 与 App Data 的只读/可变边界，并增加重复运行与 cleanup 断言。

## 5. 直接反馈与收敛准备

- [x] 5.1 运行 Host compatibility、各 System owner、Windows platform focus 和相关 contract/integration 测试，失败只重跑对应 owner。
- [x] 5.2 运行 fast、changed plan、OpenSpec strict 与 workflow/static contract，确认日常入口和完整行为集合不减少。
- [x] 5.3 收敛 Brief/current knowledge evidence，核对 checklist、owner coverage map 和多轮 timing 采集准备，达到 archive readiness。
