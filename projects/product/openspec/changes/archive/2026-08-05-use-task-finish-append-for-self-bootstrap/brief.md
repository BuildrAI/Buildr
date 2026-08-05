# Buildr自举Task Finish改用append组合

当前自举Workspace把专属sync维护接入Task Finish时，不再要求通用Skill提供命名slot，而是由Workspace Component直接把贡献片段追加到Skill末尾。Formal Finish、自举Skill适用性和失败结果边界不变，普通用户Workspace不会获得自举资产或slot。

技术入口：`proposal.md`、`design.md`与两个delta spec。
