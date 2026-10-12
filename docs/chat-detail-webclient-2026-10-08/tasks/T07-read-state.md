# T07 已读版本合并与可见后确认

[返回任务总览](../README.md)

| 项目                   | 内容                            |
| ---------------------- | ------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收  |
| 优先级                 | P1                              |
| 阶段                   | B：协议与稳定性                 |
| 前置任务               | [T13](T13-time-contract.md)     |
| 证据类型               | 局部复现                        |
| 建档日期               | 2026-10-08                      |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR |

## 背景与差异

当前较旧 unread 事件可能覆盖更新 read；WebClient 已读语义包含 readRunId、lastRunId、readAt 等版本依据，详情进入也需与真正可见区分。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 建立并验证 readRunId/lastRunId/readAt 及 RunIDAfter 的比较规则，禁止只按到达顺序覆盖。
2. 将已读提交门槛放在内容就绪且会话可见之后。
3. 区分本地展示、提交中和服务端确认，失败保留真实未读。
4. 复用 SQLite 已有 readAt/readRunId 和现有合并入口，仅为确认缺失且比较规则必需的字段新增 repository/SQLite 迁移；目录变更刷新 MMKV 首页快照，readAt 不参与消息内容排序，不维护第二份未读真源。

## 当前项目接入点

- [src/features/chatPersistence/chatReadState.ts](../../../../src/features/chatPersistence/chatReadState.ts)
- [src/features/chatPersistence/chatRepository.ts](../../../../src/features/chatPersistence/chatRepository.ts)
- [src/features/chatPersistence/useChatDetailConversationController.ts](../../../../src/features/chatPersistence/useChatDetailConversationController.ts)
- [src/features/chatPersistence/schema.ts](../../../../src/features/chatPersistence/schema.ts)

## WebClient 参考入口

- [src/shared/data/api/dto/chats.ts](../../../../../agent-webclient/src/shared/data/api/dto/chats.ts)
- [src/features/conversation/lib/conversationReplay.ts](../../../../../agent-webclient/src/features/conversation/lib/conversationReplay.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 旧 unread 不覆盖新 read。
- [ ] 后台加载与切换中请求不误标已读。
- [ ] 确认失败不清零。
- [ ] 多端 push 和重开状态一致。
- [ ] 旧数据库迁移不丢消息/outbox。
- [ ] 首页角标与详情一致。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatReadState.test.mts](../../../../scripts/tests/chatReadState.test.mts)
- [chatDirectoryProjector.test.mts](../../../../scripts/tests/chatDirectoryProjector.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                            |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                 |
| 范围决定与协议样本           | 已读版本与可见性；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                   |
| 变更文件与设计取舍           | 按 readRunId/readAt 和消息版本拒绝旧 read/unread 回退；详情获得焦点、App 前台、首屏已就绪且 skeleton 消失才确认；旧历史页不覆盖 read；继续刷新目录快照。 |
| 测试命令、结果与证据位置     | chatReadState.ts、chatRepository.ts、controller、chatSyncService.ts；chatReadState / chatWebclientSync 回归。；总览记录正式检查结果                      |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                      |
| 迁移与回滚方式               | 无 schema 或依赖变更；新增 snapshot 字段可选，瞬态不落库；旧 SQLite 与 viewport 数据兼容保留，空续聊沿用 outbox；回滚代码无需删库                        |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                          |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                       |
