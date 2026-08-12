## 1. Windows 平台语义收口

- [x] 1.1 将 Git worktree、Workspace、Task Environment 与验证 helper 的目录身份判断统一到平台感知的 filesystem identity owner
- [x] 1.2 将 self-bootstrap closeout 和 Task Finish 测试夹具中的 Node 脚本统一改为 Node executable 加脚本参数启动
- [x] 1.3 将 CLI、launcher 与 self-bootstrap 测试中的 Windows 路径断言改为平台无关的身份或分隔符断言
- [x] 1.4 将 runtime adapter 的期望文件比较统一到平台感知 helper，Windows 不以 POSIX executable bit 判定 stale
- [x] 1.5 增加架构和回归测试，阻止平台身份、脚本启动和文件模式语义再次分叉

## 2. Node 24 支持边界

- [x] 2.1 将 npm package、lockfile、安装入口和运行时错误信息统一为 `>=24.15.0 <25`
- [x] 2.2 更新开发入口与兼容性测试，证明 Node 24.15.0/24.x 可用且 Node 25 不在当前承诺范围
- [x] 2.3 更新 README、发布清单和相关公开说明，区分精确受管 runtime 与产品兼容范围

## 3. 候选 CI 分层

- [x] 3.1 为目标为 `dev` 的任务分支配置 Windows Node 24.15.0/24.x 定向平台预检，并禁用 fail-fast
- [x] 3.2 为最终候选保留 macOS/Windows × Node 24.15.0/24.x 四个完整 `test:candidate` 作业
- [x] 3.3 删除两个重复的独立 `release-smoke` 作业，并验证 Candidate 仍包含 `release-tarball-smoke`
- [x] 3.4 增加 workflow/registry 静态测试，验证触发分层、矩阵和定向 selector 不漂移

## 4. 当前认知与验证

- [x] 4.1 创建 Change brief 与 knowledge impact sidecar，并更新 Buildr Service 和技术架构当前认知
- [x] 4.2 运行 OpenSpec strict、静态、受影响和完整本地验证，修复全部确定性失败
- [x] 4.3 在 Windows Node 24.15.0/24.x 运行定向平台预检并完整汇总两个作业结果
- [x] 4.4 核对最终四矩阵的 branch protection 迁移要求和发布前操作清单，不在本 Change 中创建 release tag
