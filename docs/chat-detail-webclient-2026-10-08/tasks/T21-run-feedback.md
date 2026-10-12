# T21 Run 反馈及历史恢复

[返回任务总览](../README.md)

| 项目                   | 内容                                 |
| ---------------------- | ------------------------------------ |
| 状态                   | [-] 当前契约本地实现完成，待真实联调 |
| 优先级                 | P2                                   |
| 阶段                   | C：能力扩展（按范围选择）            |
| 前置任务               | [T05](T05-run-owner.md)              |
| 证据类型               | 静态差异                             |
| 建档日期               | 2026-10-08                           |
| 本期范围 / 负责人 / PR | 纳入本期 / Codex / 未创建 PR         |

## 背景与差异

当前 DTO 已有部分反馈字段，但详情尚未形成点赞/点踩、评语、清除和回放的完整链路；对应旧清单 TODO-19。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 按 owner/chatId/runId 接入反馈提交与清除。
2. 定义点踩评语流程及 optimistic rollback。
3. 把服务端 snapshot 反馈恢复到对应 run。
4. 防止重复提交和旧响应覆盖新反馈。

## 当前项目接入点

- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)
- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/features/chatPersistence/components/RuntimeTimelineRow.tsx](../../../../src/features/chatPersistence/components/RuntimeTimelineRow.tsx)

## WebClient 参考入口

- [src/features/conversation/hooks/useRunFeedbackAction.ts](../../../../../agent-webclient/src/features/conversation/hooks/useRunFeedbackAction.ts)
- [src/shared/data/api/dto/chats.ts](../../../../../agent-webclient/src/shared/data/api/dto/chats.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 反馈绑定正确 run。
- [ ] 清除评语和状态符合契约。
- [ ] 失败回滚。
- [ ] 切换会话后响应不污染。
- [ ] 重开恢复与服务端一致。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatProjector.test.mts](../../../../scripts/tests/chatProjector.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录（实施时填写）

| 记录项                       | 结果                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 本地实施；真实验收未完成                                                                                                                                                                                                                                                                                                                                     |
| 实际代码、参考代码与后端版本 | React HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73`（含既有未提交改动）；WebClient HEAD `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；本地 Backend HEAD `b60bbf8a67e02cb569e90e08691b0821537438c6` 只读核对；部署版本待 T00                                                                                                                                             |
| 范围决定与协议样本           | WebClient useRunFeedbackAction/requests/chats，Backend handler_feedback.go、api FeedbackRequest/Response、chat lifecycle.SetFeedback。当前只支持 thumbs_down/clear，无 thumbs_up；点赞尚缺真实后端契约，不能按现有接口伪造成功。clear 省略 setAt，详情省略反馈全部字段；samples 固定于 chatRunFeedback/chatWebclientService 测试                                        |
| 变更文件与设计取舍           | 新增 chatFeedbackProtocol、timelineRunFeedback、ChatRunFeedback；RunNode/serializer/reducer/merge/projector/service/list 和 i18n 接入。复用同一 run 的已确认反馈与瞬态 pending，无反馈表/outbox/第二份会话 store。跨来源由 source service 路由，canonical Team owner 不夹成员 Agent。Run ID 索引只缓存节点 ID、仅 orderedNodeIds 改变重建；正文热路径 O(1) 获取反馈 run |
| 测试命令、结果与证据位置     | 最终验证见下；node 定向/全量脚本、pnpm exec tsc --noEmit、pnpm lint、Web 导出与 XGraph。未执行 prepare:runtime，不刷新 Native/品牌或依赖                                                                                                                                                                                                                                |
| 真实后端 / Native 联调       | 未执行；真实 Agent/Team、AP/Desktop 提交/清除/跨会话/重开与 Native 评语输入待 T00/T31；点赞仍需确认部署后端的新增契约                                                                                                                                                                                                                                                   |
| 迁移与回滚方式               | 无 schema 变更。已确认反馈沿 rich snapshot，pending 不序列化且恢复时剥离；老缓存没有 feedback 时保持未知，服务端 runs 明确存在而字段省略时是清除。回滚 UI/纯投影与提交方法，不删库                                                                                                                                                                                      |
| 阻塞项与后续事项             | 当前响应没有反馈版本/clear 时间，无法证明服务端副本的新旧；阻止本地并发提交和提交期间启动的旧请求/历史页覆盖即可，后续新快照由后端权威校准。点赞缺口保留；实际部署支持性与 Native 操作仍待 T00/T31                                                                                                                                                                      |
| 临时状态清理与原有改动保护   | 最终审计见下；无依赖/lock/配置变更，既有改动保留                                                                                                                                                                                                                                                                                                                        |

## 本次范围记录

2026-10-08：继续完整目标，T21 按真实现有契约实施点踩、可选评语（移动输入与 service 限 4,000 字符）和清除。完成的对应 run 回答 footer 提供入口；打开时显示已确认评语，失败保留本次评语草稿供重试，取消不发请求，清除不带评语。反馈请求由 source service 复核会话可写和当前 owner/chat/run，物理 single-flight 覆盖预检/RPC/回滚。同一个 run 未确认时不允许第二次提交；run 的开始/结束时间、耗时和业务终态不随反馈改变。

乐观展示仅使用该 RunNode.feedbackPending，确认前不改 feedback、不单独写 SQL。成功验证 scoped chatId/runId/type 和严格 epoch ms setAt 后保存已确认 feedback；clear 置 null 并移除 pending。失败清 pending、恢复已确认反馈；source 生命周期和请求 ID 防止迟到响应写入替换实例。恢复由服务端 runs 加入同一 run，缺失字段按当前 DTO 的 clear 语义处理；明确旧历史页保留已确认状态，而最新 Desktop 详情即使保留历史，也接受权威 clear。

reconcile 保存请求前 timeline 引用，merge 对比对应 run 的已确认 feedback 引用，避免启动于提交前的旧响应覆盖新确认结果。持久化只写确认值；pending 被 serializer 和 cold restore 排除。没有提交队列、重启自动重发、事件总线、轮询或专用默认设置。点赞因当前后端拒绝 thumbs_up 而未实现，不把缺口标为完成；真实后端和 Native 联合验收仍未完成。

本轮最终验证：定向 40/40、全量 675/675、`pnpm exec tsc --noEmit`、`pnpm lint`、Web 导出、`xgraph sync` 与 `xgraph status` 均通过。点赞协议、真实后端与 Native 联合验收仍未完成。

本轮清理审计：638 个基线文件中 605 个保持原哈希，33 个变化限于 T21 实现/测试、执行记录与 XGraph 派生；新增反馈协议、纯状态 helper、评语组件和专项测试 4 个文件。暂存区完全一致，1,964 个 `.expo`/生成文件恢复或不变，无新生成产物；本轮临时基线、生成备份、日志与 Web 导出按所有权移除并复核。无依赖、lock、配置或 Git 分支变更，原有用户改动保留。
