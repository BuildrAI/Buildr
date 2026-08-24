## 1. Baseline and owner map

- [x] 1.1 记录当前 Verification、Task Environment、Execution Record、Worktree provider 的 import、Bootstrap 注册与 architecture boundary 测试基线。
- [x] 1.2 在 Child worktree 中确定 Verification declaration parser、Task execution record、Task Environment 和 Git Worktree provider 的最终 owner 路径。

## 2. Verification boundary migration

- [x] 2.1 建立 Verification-owned declaration parser/validator 入口，迁移 `parseProjectVerification` 与 `validateProjectVerification`，保持既有校验结果。
- [x] 2.2 更新 Verification application、Task Verification 与 System Doctor diagnostics adapter 的 import，消除 Verification 对 Doctor application parser 的反向依赖。
- [x] 2.3 将 capability runner、process executor、resource coordinator、evidence lifecycle 与 verification execution-record producer 收敛到 Verification infrastructure，并保持 exports/behavior。

## 3. Task execution and Worktree boundary migration

- [x] 3.1 将 Git Worktree provider 收敛到 Task infrastructure，保留 `buildr.git-worktree-provider/v1`、CLI adapter、evidence 与 cleanup semantics。
- [x] 3.2 保持 Task Environment、Task Execution Record、Task Verification 的 Application/Domain/Persistence owner，改用窄 port 连接 Verification producer 与 Workspace Control Plane query。
- [x] 3.3 更新 Bootstrap/module registry、静态架构测试、fixtures 和测试 import，删除旧 owner 实现或只保留受控兼容 re-export。

## 4. Verification

- [x] 4.1 运行 parser/diagnostics parity、Task/Verification unit/component/contract tests，确认公开行为与 Result 语义不变。
- [x] 4.2 运行 architecture boundary/static validation，确认旧路径、反向依赖、循环依赖和越界写入均不存在。
- [ ] 4.3 更新 Change tasks 勾选并形成 Task Development 的 stable Content Target、Verification、Candidate 与 Finish handoff evidence。
