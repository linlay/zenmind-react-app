# T08 发送准入与空 query 续聊

[返回任务总览](../README.md)

| 项目                   | 内容                            |
| ---------------------- | ------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收  |
| 优先级                 | P1                              |
| 阶段                   | B：协议与稳定性                 |
| 前置任务               | [T05](T05-run-owner.md)         |
| 证据类型               | 静态差异                        |
| 建档日期               | 2026-10-08                      |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR |

## 背景与差异

WebClient 通过 canContinue 与运行状态控制发送和空 query 续聊；当前状态推断不能只依赖预分配 chatId 或本地乐观消息。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 接入服务端和有效历史派生的 canContinue。
2. 区分首轮正文、后续允许的引用输入与受控空 query。
3. 仅在协议允许的异常结束等状态提供空 query 续聊，阻止 active/awaiting 重复发起。
4. 联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。

## 当前项目接入点

- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/features/chatPersistence/chatDetailViewModel.ts](../../../../src/features/chatPersistence/chatDetailViewModel.ts)
- [src/features/chatPersistence/components/Composer.tsx](../../../../src/features/chatPersistence/components/Composer.tsx)
- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)

## WebClient 参考入口

- [src/features/composer/lib/sendEligibility.ts](../../../../../agent-webclient/src/features/composer/lib/sendEligibility.ts)
- [src/features/conversation/hooks/useConversationActions.ts](../../../../../agent-webclient/src/features/conversation/hooks/useConversationActions.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 空新会话不能误续聊。
- [ ] 存在 chatId 不等于可继续。
- [ ] 运行中或 awaiting 不重复 query。
- [ ] 可继续场景按协议生成新 run。
- [ ] 断网重试保留发送模式且不重复发送。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatDetailViewModel.test.mts](../../../../scripts/tests/chatDetailViewModel.test.mts)
- [chatTimelineRunUnavailable.test.mts](../../../../scripts/tests/chatTimelineRunUnavailable.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                                                            |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                                                 |
| 范围决定与协议样本           | query 准入与空续聊；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                                                 |
| 变更文件与设计取舍           | 联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。 |
| 测试命令、结果与证据位置     | chatDetailViewModel.ts、chatRepository.ts、timelineReducer.ts、chatSyncService.ts；service 测试覆盖权限、single-flight 与气泡隐藏。；总览记录正式检查结果                                |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                                                      |
| 迁移与回滚方式               | 聊天缓存使用 schema 9；旧 scope 首次打开时一次性清空聊天表、对应目录快照及应用管理的资源图片缓存，新版本不重复清空，高版本拒绝降级打开；认证、来源配置、远端数据和用户原始文件保留。 |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                                                          |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                                                       |
