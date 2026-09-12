# 登记任务验证报告

### 先选择报告writer

项目检查的execution root与Task Verification Report的writer是两个独立事实。Task worktree可以运行真实检查并在操作系统临时目录形成portable report，但`task verification inspect|record`必须由canonical Workspace的合法installed或retained Buildr执行；`--target`只选择Workspace，不授予writer provenance。

- Buildr Product自举Workspace：当前execution root是与canonical Workspace共享Git common directory的linked Task worktree时，第一次`inspect`前直接选择`<canonical-workspace>/projects/product/buildr`，并用同一绝对入口完成`record`；不得先调用worktree内的candidate Buildr。
- 普通Workspace：使用该Workspace当前合法的installed或retained Buildr；不得假设存在`projects/product/buildr`。
- candidate writer被拒绝时保留零写入事实，切换到retained入口登记同一份report；不得绕过provenance、手写SQLite或仅为登记报告重新运行已经完成的测试。

报告必须说明内容版本、实际检查、`focus|task-related|full`选择、具体测试目标、`command|agent`来源、结果、摘要、耗时（可得时）、未覆盖项和结论。只有一句“测试通过”不构成有意义报告。使用：

```text
<selected-writer-buildr> task verification inspect <task-id> [--content-identity <identity>] --target <canonical-workspace> --json
<selected-writer-buildr> task verification record <task-id> --report <json-file> --expected-report <absent|sha256-digest> --target <canonical-workspace> --json
```

记录前先用`inspect`读取真实current槽位：不存在时使用`absent`，存在时使用返回的`reportDigest`作为`--expected-report`。Application从Task scope读取当前项目测试地图identity，确认实际检查属于Task且testing family与可用地图一致，生成系统完成时间；Repository在同一事务内比较已观察摘要并原子整值替换唯一current报告。冲突时保持current不变，智能体必须重新读取真实报告和当前内容后决定重做或替换，不能自动重试。摘要只是调用参数，不进入报告业务事实。地图缺失或损坏时不否定已完成的真实测试：Application把相关检查标记为“地图不可用”，并追加明确未覆盖项；智能体不能把它说成已由地图声明。

`passed`至少需要一个实际检查且所有检查均通过；只有未覆盖项不能写成`passed`。`not-passed`必须有失败检查；`incomplete`用于没有失败检查但仍有未覆盖项的情况。只有调用方在`inspect`时提供当前内容identity，Application才能判断内容是`current`还是`stale`；未提供时内容适用性为`unknown`。历史执行日志不迁移为新成功事实。
