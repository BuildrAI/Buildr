## Why

当前最终 Candidate 在 macOS、Windows × Node 24.15.0/当前 24.x 上执行四份完整验证，但 `test:candidate` 会切换到 Workspace 固定的受管 Node 24.15.0，导致两组 Host Node 矩阵的大部分证据重复，且没有独立证明 npm 用户入口在当前 24.x 上的版本敏感边界。同时，单体 System owner 把数十个不同资源特征的测试锁在一个进程和一组并发预算中，Windows 只能整体串行，放大了候选反馈时间和故障定位成本。

## What Changes

- 将最终 Candidate 收敛为 macOS、Windows 各一份完整受管运行时验证；两个作业先在 Host Node 24.15.0 下完成短版兼容验证，再切换到受管 Node 运行完整 Candidate。
- 新增 macOS、Windows 当前 Node 24.x 的短版 Host Node 兼容作业，直接验证 engines、依赖安装、tarball 安装、CLI 初始化/诊断以及 SQLite、Process、Filesystem 等版本敏感边界。
- 保留 Windows pull request 的最低/当前 Node 高风险平台预检，禁用 fail-fast；删除相同 `main` tree 上重复运行的完整 Candidate。
- 将单体 System Candidate owner 拆为资源特征明确、可独立计时和调度的 owner；保留 `npm run test:system` 作为完整 System 故障定位入口。
- 将 `workspace-product` 的 manifest/registry、runtime recovery、Local App HTTP、App process/preview 场景拆为独立测试文件，并隔离 App Data、进程环境、端口和临时目录。
- 复用只读 Workspace/Controller/Web dist 基线，保留每个可变 Workspace、SQLite、Git worktree、Task/Finish 和 Local App runtime state 的独立状态；fresh build 仍真实执行被测 Buildr/Buildr Web 安装与 Web 构建。
- 暂不调整非阻断时间预算；在同一冻结 tree 取得多轮绿色 timing 后再单独校准。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 调整最终 Candidate 的 Host Node/受管运行时矩阵语义、System owner 调度与只读 fixture 复用边界。

## Impact

- 影响 `.github/workflows/verify.yml`、Buildr verification registry/planner/executor、System 测试入口和相关契约测试。
- 影响 `projects/product/openspec/specs/product-verification-quality/spec.md` 中明确写死的四份完整 Candidate 契约。
- 不改变 Buildr CLI、Workspace 数据、npm package 公共行为或正式发布 workflow；正式不可变 tarball 发布流程由独立 Task 处理。
