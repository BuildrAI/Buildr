# 设计

## 关键取舍

- **复用既有维护框架，不在更新流程内同步删除。** 更新流程（`program-upgrades.ts`）换绑成功即结束；旧包可能仍被收尾中的进程打开。把回收交给既有周期性存储维护（只读计划 → 条件执行 → 身份/占用/引用复查 → 延迟重试），天然满足“还在用就等没用了再回收”，也避免更新失败路径复杂化。
- **候选范围**：`programs/<已知执行器>/` 的直接子目录，含版本包目录（`package-<version>-<platform>-<arch>` 及旧布局 `<version>-<platform>-<arch>`）与崩溃遗留的 `.prepare-*` 准备目录。未知执行器目录不纳入。占用观察以该包目录自身为界（`ownerRoot` = 包目录），无关程序的运行不阻止回收。
- **引用来源（保留即不回收）**：
  1. 连接库（connections SQLite）中所有绑定的 `view.executable`、`bindingData.executable`、`programSource` 路径所落在的包目录；
  2. `program-upgrades/<id>.json`：未完成态（downloading/waiting/restarting/failed/interrupted）保留 `executable` 与 `installedExecutable` 两者（回退与待切换目标）；completed 不额外保留（换绑已提交，新包由连接绑定覆盖，`executable` 只是更新前观察；避免历史记录永久钉住已解绑的包）；不可解析的记录保守保留该执行器全部包目录；
  3. 各执行器当前策略默认安装位置（未绑定连接的受管默认路径，保持“准备并连接”可复用）。
- **稳定窗口沿用 24 小时**（与现有候选 cutoff 一致）：覆盖“安装完成但更新记录尚未写入 installedExecutable”的窗口期竞态，也过滤崩溃残留的即时误删；旧包在换绑后约一天内由后续周期回收，满足不长期遗留。
- **保守失败**：连接库读取失败或更新记录不可解析时，对应观察不完整，受影响包保留并报告理由；执行阶段重新读取引用，计划后新增绑定即保留。

## 兼容策略

- `StorageCandidate.kind` 增加 `program-package`，计划 schemaVersion 不变（新增 kind 为 additive，旧消费者按 kind 字符串透传）。
- 删除仍走 `removeStorageCandidate` 的窄锁改名-复查-删除协议，身份变化、占用出现或引用新增均恢复原名保留。
- 更新流程、连接绑定、安装布局与策略默认路径均不改动。

## 迁移风险

- 无存储格式迁移。主要风险是误删仍被引用的包：通过三重引用来源、24 小时稳定窗口、执行时引用重读与占用复查控制；引用观察失败一律保留。
- 旧布局目录（如历史 `1.1.75-darwin-arm64`）同样按引用判断，不做名称特判。
