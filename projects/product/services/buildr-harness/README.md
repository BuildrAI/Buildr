# Buildr Harness

独立的本机智能体工作台。一个包提供 `buildr-harness` 命令、生产 Web 和系统启动器，不需要安装 Buildr Development 或 DeepSeek Harness。

## 安装与打开

首发验收面向 macOS arm64，需要 Node.js 24.15.0 或更新版本。待首个公开 RC 发布后，可按发布说明给出的版本安装。例如：

```sh
npm install --global @buildr-ai/buildr-harness@0.1.0-rc.1
buildr-harness launcher install
```

从个人「应用程序」文件夹打开 **Buildr Harness**，也可直接运行 `buildr-harness web`。默认启动器同时作为正式 DSH 插件的安装发现入口；npm 或 Node 路径变更后重新运行 `buildr-harness launcher install`。

独立应用不需要 DSH。要在 DSH Desktop 中使用它，请参见 [DSH Buildr Harness 安装说明](https://github.com/BuildrAI/Buildr/tree/main/projects/product/services/buildr-harness-dsh-plugin)。普通卸载先执行 `buildr-harness launcher uninstall`，再执行 `npm uninstall --global @buildr-ai/buildr-harness`；不会删除共享账号或对话。
