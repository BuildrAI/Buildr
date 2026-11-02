## Context

统一权限解析目前省略时返回 default；历史运行也可能没有 permissionMode。DSH 仅在原生目录发现 danger-full-access 时声明支持完全访问。

## Goals / Non-Goals

**Goals:** 新请求统一默认 full-access，保留显式选择、准确预览和记录、旧数据安全兼容。

**Non-Goals:** 不迁移历史数据，不修改原生全局设置，不改变任务记录，不激活或发布应用。

## Decisions

- 统一解析仅针对新调用的缺省值改为 full-access；历史运行缺失字段仍按 default 比较，避免错误复用或继续执行。
- 对话草稿结合连接能力在省略时回退 default；显式不支持的选择仍拒绝。DSH 直接映射也按原生目录处理省略值，保留命令执行和读回确认。
- 旧 legacyDigest 仅在明确 default 时可匹配；省略值的新语义不允许复用旧摘要。重复请求与预览仍绑定有效权限。
- Web 没有明确偏好和历史时使用新默认，缺少能力则显示 default；已有偏好不被覆盖。CLI send 新增 --permission-mode，省略时交给统一服务解析。

## Risks / Trade-offs

- 默认访问扩大是用户明确要求；需要受限权限的调用方应显式传 default。
- 不支持接入回退是可用性选择，实际预览和运行记录必须诚实显示 default，而非伪装完全访问。
- 旧请求省略值重试可能因语义变化发生冲突，应读取原请求，不自动重发。历史记录不迁移。
