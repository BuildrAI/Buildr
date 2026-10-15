## Why

来源列、详情和 Buildr 页面曾由组合插件（Composition Plugin）交付；后续为原安装器（Installer）增加全入口安装前互斥，把日常应用换成了依赖开发目录的本机构建。用户要求恢复官方应用，并保留全部来源界面与原会话配置，因此需要让增强组件与正常装卸生命周期一起由插件（Plugin）交付。

## What Changes

- 保留当次来源语义、原轨迹来源列、原详情与并列 Buildr 页面；官方应用文件保持官方发行字节。
- 将增强生产者（Producer）、轨迹及必要设置贡献组成自足安装包，停用或卸载后恢复官方组件与预设（Preset），不留下指向已移除包的引用。
- **BREAKING**：撤销所有入口安装前拒绝第二个 Buildr 的交付要求，改为插件（Plugin）启用冲突诊断与同一运行域内合作版本的单实例保护；不修改官方安装器（Installer）。
- 在精确官方 macOS arm64 发行物中完成安装、停用、卸载、重装、来源持久保存及界面检查后，保全日常应用和数据，再恢复官方应用并采用新包。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `dsh-plugin-distribution`：官方应用上的自足增强组合装卸，以及启用冲突替代全局安装前互斥。
- `dsh-buildr-provenance`：增强组件通过可逆插件（Plugin）配置层交付，保持原来源语义和原界面。
- `dsh-desktop-integration`：验证后恢复官方应用的保全、采用与当前运行身份检查。

## Impact

修改 `services/dsh-plugin` 的组合构建、插件（Plugin）启用、预设（Preset）接线、必要检查与当前说明，不修改上游 DSH 源资产或官方应用文件。已有精确来源补丁作为插件（Plugin）组件的构建输入保留；原安装器（Installer）补丁仅留历史，不进入新包。没有公开发布或不相关升级。
