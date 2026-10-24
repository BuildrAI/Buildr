# Archify 自用技能与旧安装迁移

Archify 已退出 Buildr 产品安装包及内置组件列表。Buildr 自举工作空间使用自己的 `skills/buildr/archify/`，普通用户可独立选择其他绘图工具；绘图不是任务、OpenSpec 或诊断的必需依赖。

## 自用来源

上游为 [tt-a1i/archify](https://github.com/tt-a1i/archify)，当前保留完整正式发行版本 `3.1.0`、MIT 许可证及第三方声明。[原发行包](https://github.com/tt-a1i/archify/releases/download/v3.1.0/archify.zip) 的 SHA-256 为 `ffedc53390c9da6e859f41e432c5d2d0615a23cf00a503181f07efbba88a7ce8`。上游附件移到仓库根 `skills/buildr/archify/assets/archify/`，不裁剪示例、不拷入个人缓存，也不进入产品随包资源。

## 旧工作空间

更新前若官方共享集含 Archify，Buildr 先校验并将来源保存在本机 `.buildr/local/preserved-skills/archify/`（相对于用户主目录），再替换官方共享目录。新安装不创建这份保留数据；它是旧安装迁移来源，不属于当前官方资源，也不自动下载或升级上游。

已安装的旧空间重新准备时，Archify 自动转为 `skills/buildr/archify/` 下的自有技能（Skill），保留完整附件、启停选择、用户本地修改和图示，再重建智能体入口。已确认的旧官方组件登记解除，不自动删除可能含用户修改的历史定义文件。暂不可访问的空间恢复后仍可从保留来源迁移；不能仅凭当前没有可访问的使用方就删除这份来源。

来源损坏、非法路径、符号链接、不同历史来源冲突或旧组件包含额外成员时，保留现场并报告具体问题，不静默覆盖。工作空间自有 Archify 后续通过普通技能维护，不再随 Buildr 官方资源更新。
