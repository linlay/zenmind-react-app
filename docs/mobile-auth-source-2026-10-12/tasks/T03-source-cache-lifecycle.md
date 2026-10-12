# T03 统一来源、缓存与启动退出生命周期

[返回总览](../README.md)

状态：**进行中**。前置：[T01](T01-cloud-token-credentials.md)、[T02](T02-cloud-availability.md)。范围：唯一来源选择、业务缓存与连接生命周期。

## 目标

云端与账号电脑独立登录，所有业务仍跟随同一个所选来源。选择、缓存和连接保持一致，异步结果不串源。执行遵守[最小架构与执行约束](../README.md#最小架构与执行约束)。

## 先读

- [当前电脑选择](../../../src/core/auth/activeDesktop.ts)
- [缓存映射](../../../src/core/auth/accountDesktopCacheScopes.ts)
- [来源解析](../../../src/features/chatPersistence/chatSourceRuntime.ts)
- [切换协调](../../../src/features/chatPersistence/accountDesktopSource.ts)
- [SQLite](../../../src/features/chatPersistence/database.ts)
- [目录快照](../../../src/features/chatPersistence/homeSnapshot.ts)
- [启动](../../../src/app/AppRoot.tsx)
- [导航](../../../src/app/navigation/RootNavigator.tsx)
- [来源选择回归](../../../scripts/tests/accountSourceSelection.test.mts)

## 最小变更

1. 扩展既有来源选择，最小表达默认云端、账号电脑和暂无可用来源；保留一个选择真源。不得继续以“没有 Desktop ID 就等于可用云端”推导当前来源。
2. 仍由现有 feature service 协调 SQLite scope、目录快照、选择通知与连接。页面不写数据库、凭证或自行回滚。
3. 电脑缓存维持账号＋电脑隔离。默认云端改按默认来源及本地凭证归属隔离，不再依赖 Identity accountId；同一有效凭证恢复既有 scope，明确换凭证才换 scope。
4. 不明文使用 Token 作为业务 ID 或数据库名。更换凭证后不得重放旧 outbox；对确认属于被替代云端归属的旧本地缓存，按已有清理能力处理，不迁移、不认领，不误清电脑缓存和用户设置。
5. 启动优先恢复上次选择；首次验证云端，成功才启用，否则停在登录/选择引导。账号恢复不能阻塞有效 Token 的云端访问，也不能泄露未确认有效的电脑账号缓存。
6. 离线电脑保留选择和所属缓存，不签发远端凭证、不创建新对话；列表请求失败保留已知列表，只有成功的权威列表能确认撤销。
7. 所选电脑撤销或账号明确失效后停止访问并隐藏失效内容，进入引导，不自动选云端或其他电脑。云端网络断线保留缓存，远端操作禁用。
8. 两种退出只释放各自访问。退出未选中的另一条登录路径不打断当前来源；退出当前来源后停在相应引导，不自动跳源。
9. 沿用现有生命周期和迟到请求保护，分别按实际凭证及来源失效；切源或退出不取消已提交远端任务。通知、搜索、详情和 WebView 不绕过所选来源归属。

## 验收

- [ ] 四种凭证组合、首次启动、重启、账号恢复失败及来源恢复均符合总览。
- [ ] 云端/电脑/暂无来源之间切换时，选择、SQLite 与连接没有短暂错配。
- [ ] 两账号、两电脑、换 Token 的缓存和迟到结果不串源，旧 outbox 不重放。
- [ ] 离线查看与远端操作门禁生效；查询失败不误撤销，撤销后不自动回落云端。
- [ ] 独立退出不误关闭另一条访问，远端已提交任务继续，无重复同步服务或来源 store。

## 执行记录

- 日期 / 执行者 / 版本：2026-10-12 / Codex / 基线 `64e015bf28bf12c43f50640257f3ab7d402dbb73`，在既有未提交工作区增量实施。
- 实际状态：来源/缓存/退出实现与本地组合验证完成；真实账号/电脑验收由用户执行。
- 实施与证据：扩展 activeDesktop 为唯一 cloud/desktop/null 选择；accountDesktopSource 协调选择、SQLite 和连接。云端独立 credential scope，电脑保留账号＋电脑 scope；旧账号云端缓存精准清理、不迁移 outbox。旧电脑偏好等待匹配账号恢复，首次仅验证成功才选云端；账号恢复不挡有效云端。撤销/账号失效隐藏电脑内容并停在引导，独立退出互不影响；断线缓存只读。
- 本地验证：见 [T05](T05-validation-cleanup.md) 最终检查记录；mock/生产导出不代表真实服务或真机通过。
- 真实验收：用户明确由自己测试；默认源当前为 example 占位环境，未部署服务或改变真实配置。
- 清理与保护：任务前记录 HEAD、分支、暂存区/worktree diff 及文件 hash；构建前备份生成目录与 Expo 状态，审计并恢复本次临时产物。原有改动保留，未改 lock/依赖/环境；最终清理证据见 T05。
