## Context

Buildr 目前在三处维护默认 `.gitignore` 事实：package workspace 模板、`initBuildr` 的追加列表，以及 `syncPackageBuiltins` 的升级追加列表。Task current records 已迁入 `/.buildr/local/`，`.buildr/tasks/` 只剩 Environment Receipt 与不再读取的旧 YAML，但三处仍未统一为整目录忽略；其中 sync 列表甚至没有补齐旧的精确 Environment 规则。

## Goals / Non-Goals

**Goals:**

- 让新建和已有 Workspace 都确定性得到 `/.buildr/tasks/`。
- 保持 `.gitignore` 追加式、幂等和保留用户内容的现有行为。
- 用测试覆盖 package baseline、init 与 sync 三条入口。

**Non-Goals:**

- 不迁移、读取或删除旧 Task YAML。
- 不执行 `git rm --cached`，不改变已跟踪历史文件。
- 不移动 Environment Receipt，也不新增 Task Store 或同步机制。

## Decisions

1. 以 `/.buildr/tasks/` 作为新的 canonical ignore entry。相比继续枚举 `environment.json`，整目录规则与“该目录只承载本机运行事实和 inert legacy records”的当前 authority 一致，也避免未来新增本机 sibling 时再次遗漏。
2. package 模板、init 与 sync 同时更新。只改模板无法修复已有 Workspace，只改运行代码会让随包 baseline 与真实行为漂移。
3. sync 只追加 broad entry，不主动删除旧的 `/.buildr/tasks/*/environment.json`。旧规则无害，保留 append-only 行为可以避免猜测用户是否修改过 `.gitignore`。
4. 不自动取消跟踪旧 YAML。`.gitignore` 只约束未跟踪路径；改变 Git index 是独立且可能破坏历史的迁移动作，不属于本 Change。

## Risks / Trade-offs

- [已有 Workspace 同时保留 broad 与 precise 两条规则] → 接受无害冗余，避免 sync 删除用户内容。
- [整目录规则隐藏误写的新文件] → 这是预期的 fail-safe；当前产品不再声明 `.buildr/tasks/` 下任何 portable writer。
- [已跟踪旧 YAML 仍显示变化] → 当前 runtime 不读取或写入它们；如未来需要清退 index，单独设计显式迁移。

## Migration Plan

1. 新 package 直接交付 broad entry。
2. `buildr init` 为新 Workspace 写入 broad entry。
3. `buildr sync <agent>` 为已有 Workspace幂等追加 broad entry；旧 precise entry保持不变。
4. 回滚时可恢复产品三处旧规则；用户 Workspace 已追加的 broad entry继续安全地保持本机目录不进入 Git。

## Open Questions

无。
