# T06 让应用 Tab 跟随当前来源

[返回任务总览](../README.md)

| 项目     | 内容                                                           |
| -------- | -------------------------------------------------------------- |
| 状态     | 进行中；见执行状态记录                                         |
| 建档日期 | 2026-10-09                                                     |
| 仓库     | React App；依赖来源的实际 WebApps 能力                         |
| 前置任务 | [T02](T02-desktop-access.md)、[T04](T04-mobile-auth-source.md) |

## 目标

应用列表与运行页使用当前来源，移除旧扫码 Profile 门卫，复用现有常驻 WebView 生命周期。

执行前遵守[总览的最小实现约束](../README.md#最小实现约束)，重新核对最新工作区。已具备能力可以通过验收证据关闭，不强制新增代码。

## 当前事实

- Provider 当前按旧 paired 会话启用，gateway 仍依赖旧 Profile 校验；仅账号 Desktop 无法完整启用。
- Runtime 已有 sessionKey 切换和常驻 WebView 清理结构，可复用，不能替换成另一套池。
- 云端具有独立聊天不代表必然支持 WebApps，按实际能力展示。

以上为建档时本地静态核实，不能直接代表目标环境已部署。

## 先读这些入口

- [根导航与 Provider 开关](../../../src/app/navigation/RootNavigator.tsx)
- [WebApps gateway](../../../src/features/webApps/webAppsGatewayCore.ts)
- [WebApps runtime](../../../src/features/webApps/WebAppsRuntimeProvider.tsx)
- [应用列表](../../../src/features/webApps/WebAppsScreen.tsx)
- [应用详情](../../../src/features/webApps/WebAppDetailScreen.tsx)

链接用于定位现有实现。进入其他仓库前读取其 AGENTS.md 与索引规则；不要按计划文件机械替换当前实现。

## 最小变更

1. 用当前账号、所选来源与实际能力派生 enabled/sessionKey，移除 old pairingState/Profile 前置。
2. Gateway 对电脑使用 T02 授权连接，对云端沿用 T00 核实的现有连接契约，继续通过 sharedWsTransport 订阅与读取，页面不直连 Socket 或使用通用 action.call。
3. 来源切换时释放旧来源 feature 监听、目录和常驻 WebView 上下文，避免电脑 A 的应用继续作为电脑 B 的内容。
4. 清理只针对 WebApps 所属会话，不能停止其他 feature 的共享 Socket 或重挂整个 RootStack。
5. 未登录、离线或来源不支持应用时显示各自明确状态，不伪造云端应用、不沿用旧来源在线内容。
6. 云端保持现状，不增加 WebApps 后端功能或新鉴权要求；如果现有云端支持则正常接入，否则展示能力空态。

## 不做与禁止扩展

- 不新建每设备 WebView 池、通用 runtime 引擎或第二套 gateway。
- 不为了视觉一致替换现有导航，不重建 root stack 以清状态。
- 不移除聊天监听或停止全局共享连接。
- 不把本任务扩展为新云端应用平台。

## 验收清单

- [ ] 账号 Desktop 无扫码 Profile 也能使用已有应用能力。
- [ ] Chat 与 WebApps 使用同一来源，切换后无旧目录/旧 WebView 泄露。
- [ ] 未登录、离线、不支持应用分别有明确空态。
- [ ] WebApps 清理不停止聊天连接或远端任务，未重挂 RootStack。
- [ ] 记录实际实现与验证，完成本任务临时状态清理；只有验收通过才更新为完成。

## 验证方式

覆盖 sessionKey 变化、旧 gateway 释放、无旧 Profile 账号连接、能力空态；真机验证应用 A/B 切换、退出与返回。

## 执行记录

- 状态 / 日期 / 负责人：进行中 / 2026-10-09 / Codex（本地实现），用户（真实验收）
- 实际版本、变更文件与复用/删除内容：WebApps gateway、RuntimeProvider/Host 和 WebAppsScreen 使用账号所选电脑；池会话跟随账号/手机/目标，继续复用 sharedWsTransport，云端提供能力空态。
- 测试命令、结果及真实联调证据：WebApps gateway/导航/transport 回归及 Web 导出通过；本轮审计移除应用空态固定 96px 底部避让，复用真实 tab bar height。实际电脑目录与 Native WebView 由用户验收。
- 必要迁移/回退及未完成项：无服务端历史迁移/认领；真实环境配置与验收由用户执行，参见执行状态中的验收顺序。
- 临时状态清理与原有改动保护：已核对五仓库 HEAD/分支/暂存区、依赖及任务范围外文件基线；本任务临时材料清理结果见执行状态。

本轮实现与未完成项：[执行状态及验收交接](../implementation-status.md)。勾选项仅在适用验收通过后更新；本地测试不替代实际部署。
