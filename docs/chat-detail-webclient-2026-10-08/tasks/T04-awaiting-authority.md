# T04 权威 awaiting 校准与提交收口

[返回任务总览](../README.md)

| 项目                   | 内容                                                 |
| ---------------------- | ---------------------------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收                       |
| 优先级                 | P1                                                   |
| 阶段                   | B：协议与稳定性                                      |
| 前置任务               | [T05](T05-run-owner.md)、[T13](T13-time-contract.md) |
| 证据类型               | 局部复现                                             |
| 建档日期               | 2026-10-08                                           |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR                      |

## 背景与差异

当前详情顶层 awaiting 为 null 时，历史 ask 仍可能重建为可提交状态；仅靠历史事件不能判断当前是否仍在等待。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 定义详情快照顶层 awaiting 对当前 run 的权威校准。
2. 以 owner/runId/awaitingId/mode 校验提交目标，区分历史展示与当前可交互对象。
3. 明确字段缺失、显式 null 与旧页回放的区别。
4. 处理已完成、过期、重复提交等终态响应并清理交互，提交成功后再由权威状态收敛。

## 当前项目接入点

- [src/features/chatTimeline/awaitingInteraction.ts](../../../../src/features/chatTimeline/awaitingInteraction.ts)
- [src/features/chatPersistence/chatProjector.ts](../../../../src/features/chatPersistence/chatProjector.ts)
- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/features/chatPersistence/components/awaiting/ChatAwaitingDock.tsx](../../../../src/features/chatPersistence/components/awaiting/ChatAwaitingDock.tsx)

## WebClient 参考入口

- [src/features/composer/hooks/useComposerAwaiting.ts](../../../../../agent-webclient/src/features/composer/hooks/useComposerAwaiting.ts)
- [src/features/conversation/lib/conversationReplay.ts](../../../../../agent-webclient/src/features/conversation/lib/conversationReplay.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] awaiting:null 不残留活动表单。
- [ ] 字段缺失不擅自清除。
- [ ] 加载旧页不会覆盖当前 awaiting。
- [ ] 过期或重复提交不无限等待。
- [ ] Agent/Team 与切换会话均无串提交。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatProjector.test.mts](../../../../scripts/tests/chatProjector.test.mts)
- [chatTimelineRequestVariant.test.mts](../../../../scripts/tests/chatTimelineRequestVariant.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                                                     |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                                          |
| 范围决定与协议样本           | 权威 awaiting 与提交竞态；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                                    |
| 变更文件与设计取舍           | 详情 missing 保留、null 清除、匹配 id/run/mode/status 才恢复当前交互；旧页/较旧快照不能清当前 ask；提交 single-flight、owner 和请求前后身份检查；超时回读，旧拒绝不得清掉新 ask。 |
| 测试命令、结果与证据位置     | awaitingInteraction.ts、chatProjector.ts、chatSyncService.ts；chatWebclientSync / chatWebclientService 固定竞态测试。；总览记录正式检查结果                                       |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                                               |
| 迁移与回滚方式               | 聊天缓存使用 schema 9；旧 scope 首次打开时一次性清空聊天表、对应目录快照及应用管理的资源图片缓存，新版本不重复清空，高版本拒绝降级打开；认证、来源配置、远端数据和用户原始文件保留。 |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                                                   |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                                                |
