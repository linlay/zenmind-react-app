# T04 落地登录引导、来源灰态与用户入口

[返回总览](../README.md)

状态：**进行中**。前置：[T02](T02-cloud-availability.md)、[T03](T03-source-cache-lifecycle.md)。范围：现有登录、对话、来源抽屉与用户入口。

## 目标

让用户明确知道在登录账号电脑还是默认云端，失败时能恢复，不能选择不可用云端。只消费统一 service 结果，执行遵守[最小架构与执行约束](../README.md#最小架构与执行约束)。

## 先读

- [登录页](../../../src/features/auth/LoginScreen.tsx)
- [对话首页](../../../src/features/chatPersistence/ChatHomeScreen.tsx)
- [来源浮层](../../../src/features/chatPersistence/ChatDirectoryPickerOverlayScreen.tsx)
- [来源抽屉](../../../src/features/chatPersistence/components/AccountSourceSheet.tsx)
- [用户页](../../../src/app/screens/MeScreen.tsx)
- [设置页](../../../src/app/screens/SettingsScreen.tsx)
- [设置动作](../../../src/app/settings/settingsActions.ts)
- [电脑管理](../../../src/features/deviceLink/AccountDevicesPanel.tsx)
- [应用页面](../../../src/features/webApps/WebAppsScreen.tsx)

## 最小变更

1. 账号登录用于所属电脑，默认云端增加 Token 输入/粘贴入口；账号已登录时仍能打开 Token 登录，云端已登录时仍能打开账号登录。避免一个 Login 门卫挡住另一条路径。
2. 对话空态按实际原因显示账号登录、Token 登录、连接失败/重试或选择来源；删除“账号登录后就能使用账号专属云端”的误导文案。
3. 云端来源行只在业务验证通过时可选，检测/失败时文字灰态并声明 disabled；登录与重试使用独立可点击入口，不能因整行 disabled 而无法恢复。
4. 云端使用中断线保留当前选中标记和只读缓存，标明不可发送；明确凭证失效时显示登录引导，不将其描述成普通离线。
5. 电脑列表展示有效电脑及在线状态，离线可选缓存；刷新失败保留列表并说明。电脑被撤销显示失效引导，由用户主动选择其他来源。
6. 用户页分别显示账号和默认云端登录状态及退出动作；默认云端 Token 不显示明文。登录或退出任一条路径不误提示另一条也已退出。
7. 电脑应用沿用现有能力及授权；云端仍显示不支持应用的空态，不新增应用启动/暂停、网盘或任务看板。
8. 不新增或恢复扫码，不将本期任务变成扫码协议改造；仅清理本次替代后确认无引用的 UI/文案。复用主题、ScreenHeader、AppIcon、现有抽屉及 NativeWind，不另建页面壳或设置渲染框架。

## 验收

- [ ] 四种凭证组合下两类登录入口均可达，文案与真实访问边界一致。
- [ ] 云端失败行无法选择，独立登录/重试可用，空目录不显示连接失败。
- [ ] 断线、凭证失效、离线电脑、撤销及刷新失败有对应反馈，发送等远端操作禁用。
- [ ] 两类状态/退出相互独立，没有恢复扫码或扩展工作能力。
- [ ] iOS/Android 验证键盘、返回、抽屉、safe area 和长文案；Web 导出不能替代真机验收。

## 执行记录

- 日期 / 执行者 / 版本：2026-10-12 / Codex / 基线 `64e015bf28bf12c43f50640257f3ab7d402dbb73`，在既有未提交工作区增量实施。
- 实际状态：入口、灰态及文案实现完成；键盘/返回/safe area/长文案真机验收由用户执行。
- 实施与证据：复用 LoginScreen 增加账号/云端 Token 模式与系统粘贴输入，另一条已登录时仍可达。AccountSourceSheet 消费统一可用性结果，云端 disabled 灰字且独立登录/重试；对话空态可进入来源选择，断线展示只读原因。Me 增加云端状态和独立退出，账号退出文案修正；电脑撤销不再提示切回云端。保留现有主题、抽屉、safe area 与电脑应用能力，不新增扫码。
- 本地验证：见 [T05](T05-validation-cleanup.md) 最终检查记录；mock/生产导出不代表真实服务或真机通过。
- 真实验收：用户明确由自己测试；默认源当前为 example 占位环境，未部署服务或改变真实配置。
- 清理与保护：任务前记录 HEAD、分支、暂存区/worktree diff 及文件 hash；构建前备份生成目录与 Expo 状态，审计并恢复本次临时产物。原有改动保留，未改 lock/依赖/环境；最终清理证据见 T05。
