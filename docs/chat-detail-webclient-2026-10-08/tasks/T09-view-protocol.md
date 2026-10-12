# T09 VIEW 正文、工具结果与表单

[返回任务总览](../README.md)

| 项目                   | 内容                                                      |
| ---------------------- | --------------------------------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收                            |
| 优先级                 | P1                                                        |
| 阶段                   | B：协议与稳定性                                           |
| 前置任务               | [T04](T04-awaiting-authority.md)、[T05](T05-run-owner.md) |
| 证据类型               | 静态差异                                                  |
| 建档日期               | 2026-10-08                                                |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR                           |

## 背景与差异

当前已有 viewport 和 form 桥接；需对齐新版 VIEW 在正文、工具结果、awaiting 表单中的数据与安全边界，不能仅视作新的 UI 卡片。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 覆盖三个 VIEW 入口，核对固定 hash、assets、payload 与 usage 字段。
2. 统一文档解析、鉴权资源和缓存键，保留 source/owner/成员隔离。
3. 处理 viewError，不把新版失败误降级成旧版成功。
4. 显示容器禁止提交，表单只由宿主 collect/submit，保留 QLC JSON 回退。

## 当前项目接入点

- [src/features/chatPersistence/conversationViewport/viewportDocumentStore.ts](../../../../src/features/chatPersistence/conversationViewport/viewportDocumentStore.ts)
- [src/features/chatPersistence/conversationViewport/conversationViewportFence.ts](../../../../src/features/chatPersistence/conversationViewport/conversationViewportFence.ts)
- [src/features/chatPersistence/frontendTool/FrontendToolDock.tsx](../../../../src/features/chatPersistence/frontendTool/FrontendToolDock.tsx)
- [src/core/api/services/frontendToolSubmitProtocol.ts](../../../../src/core/api/services/frontendToolSubmitProtocol.ts)

## WebClient 参考入口

- [src/features/timeline/components/ViewEmbed.tsx](../../../../../agent-webclient/src/features/timeline/components/ViewEmbed.tsx)
- [src/features/tools/components/useAwaitingFrameDocument.ts](../../../../../agent-webclient/src/features/tools/components/useAwaitingFrameDocument.ts)
- [src/shared/contracts/view.ts](../../../../../agent-webclient/src/shared/contracts/view.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 同 hash 文档不会被旧响应覆盖。
- [ ] Team 成员与会话资源不串缓存。
- [ ] 三个入口均可恢复。
- [ ] viewError 可诊断。
- [ ] 展示型 VIEW 无提交副作用。
- [ ] 表单只提交当前 awaiting 一次。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelineRequestVariant.test.mts](../../../../scripts/tests/chatTimelineRequestVariant.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                                                                                                                                              |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                                                                                                                                   |
| 范围决定与协议样本           | 三处 VIEW 消费；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                                                                                                                                       |
| 变更文件与设计取舍           | 正文 VIEW fence、工具结果和 awaiting form 共用旧文档 store 的 12 项/5 分钟缓存；新增 key 包含来源/会话/成员/usage/hash，clear/force version 拒绝旧响应；鉴权 /api/view 固定 hash，快照资源内嵌/CSP 无网络；display 无 submit，Native form 仅 host collect；QLC 回退 JSON。 |
| 测试命令、结果与证据位置     | chatViewProtocol.ts、viewDocumentHtml.ts、ConversationViewScope.tsx、viewport 与 AwaitingFormViewport.native.tsx；chatViewProtocol 6 项测试。真实 WebView 仍待验收。；总览记录正式检查结果                                                                                 |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                                                                                                                                        |
| 迁移与回滚方式               | 无 schema 或依赖变更；新增 snapshot 字段可选，瞬态不落库；旧 SQLite 与 viewport 数据兼容保留，空续聊沿用 outbox；回滚代码无需删库                                                                                                                                          |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                                                                                                                                            |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                                                                                                                                         |
