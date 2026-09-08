# Buildr 文件型交付资源

Buildr Service 使用根目录 `resources/` 保存会被产品读取、复制、安装或投射的文件型内容。它是资源 source authority，不保存用户 Workspace 的持久化状态。

## 目录职责

- `resources/manifest.yml`：声明发布 include、Workspace/Project 内容映射、Builtin、Component 与 Runtime Skill 来源。
- `resources/workspace/`：保存初始化或同步到用户 Workspace 的 Rule、Skill、Command、Component、AGENTS 与 Git 模板源。
- `resources/runtime/`：保存直接安装到 Agent runtime 的文件型源；当前包括 Buildr 产品入口 Skill。
- `resources/installation/launcher/`：保存 Launcher 使用的无行为静态图标。
- `resources/contracts/bootstrap.yml`：校验正式 bootstrap guide 与 Buildr Skill 恢复入口。

用户态 `.buildr/workspace.yml`、Project/Service registry 及其他 writer-owned manifest 不进入资源树；它们始终由对应 Domain writer 生成。

## `package/` 边界

`package/` 不再承载长期源码或交付资源。唯一保留的 `build/test-context/` 是 ignored 派生输出，由 `tools/testing/test-context-build.ts` 生成。

Development Launcher 工程程序位于 `tools/build/launcher/`；正式 npm Launcher 行为属于 `src/modules/installation/`。两者都不是文件型资源，不能迁回 `package/`。

## 维护检查

资源修改需要同步检查 `resources/manifest.yml`、初始化/同步 resolver、`buildr package check`、npm tarball、Application Payload 与受影响的 Runtime/Browser 测试。开发和发布工具属于 `tools/`，验证实现属于 `test/verification/`，产品 `bin/` 与 `src/` 不依赖这两个 checkout-only 根。
