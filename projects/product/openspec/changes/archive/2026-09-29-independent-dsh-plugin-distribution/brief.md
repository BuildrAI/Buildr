# Buildr DSH 插件独立交付

用户希望在 DSH 对话中让智能体安装 Buildr 插件，点击后打开右侧 Buildr Web；插件需要单独版本与发布节奏，并在 DSH 重启后复用仍存在的页面。

当前实现已有按钮、健康查询与本机启动，但生成包为私有且默认禁用，公开 npm 安装不成立；Buildr 主包候选又把插件当成必需输入。此次将插件源码与构建交给独立 Service，产出默认启用的预编译包，并从主包候选移除该硬依赖。`buildr runtime dsh-plugin prepare` 不再是正常用户安装步骤。正式版和开发版各自复认其创建的标签；DSH 未公开浏览器当前地址，因此不承诺复用用户手动打开的页面。

规范来源为本变更的 `specs/dsh-plugin-distribution/spec.md` 与 `specs/product-source-layout/spec.md`。实现来源包括现有 `services/buildr/resources/runtime/dsh/`、`tools/dsh/`、候选构建入口及 DSH 官方插件管理接口。知识影响涉及 `knowledge/docs/flows/dsh-plugin-release.md`、`knowledge/docs/flows/open-source-release.md`、服务实现文档与对外安装文章；需在实现后核对命令、链接、候选和已公开状态。公开发布和真实桌面重启验收分别取证。
