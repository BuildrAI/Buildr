# Buildr 文件型交付资源

Buildr Service 使用根目录 `resources/` 保存会被产品读取、复制、安装或投射的文件型内容。它是资源 source authority，不保存用户 Workspace 的持久化状态。

## 目录职责

- `resources/manifest.yml`：声明发布 include、Workspace/Project 内容映射、Builtin、Component 与 deferred Runtime Skill 来源。
- `resources/workspace/`：保存初始化或同步到用户 Workspace 的 Rule、Skill、Command、Component、AGENTS 与 Git 模板源。
- `resources/installation/launcher/`：保存 Launcher 使用的无行为静态图标。
- `resources/contracts/bootstrap.yml`：校验正式 bootstrap guide 与 Buildr Skill 恢复入口。

用户态 `.buildr/workspace.yml`、Project/Service registry 及其他 writer-owned manifest 不进入资源树；它们始终由对应 Domain writer 生成。

## Deferred package 子树

`package/targets/runtime/skills/buildr/` 暂由后续 Agent Assets Contribution 决定最终 authority；`package/launchers/build.mjs` 与 `package/launchers/manage.mjs` 暂由后续 System Contribution 拆分正式安装和开发职责。除这两类外，`package/` 不接受新内容。

退出条件是对应 Contribution 提供新的唯一 owner、迁移全部 consumer，并通过根目录结构、npm/Application Payload inventory 与行为等价验证。迁移期间不建立旧资源路径的副本、symlink 或 fallback。

## 维护检查

资源修改需要同步检查 `resources/manifest.yml`、初始化/同步 resolver、`buildr package check`、npm tarball、Application Payload 与受影响的 Runtime/Browser 测试。开发和发布工具属于 `tools/`，验证实现属于 `test/verification/`，产品 `bin/` 与 `src/` 不依赖这两个 checkout-only 根。
