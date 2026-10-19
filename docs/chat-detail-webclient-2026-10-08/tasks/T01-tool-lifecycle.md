# T01 工具生命周期与终态判定

[返回任务总览](../README.md)

| 项目                   | 内容                            |
| ---------------------- | ------------------------------- |
| 状态                   | [-] 本地实现已落地，待联合验收  |
| 优先级                 | P1                              |
| 阶段                   | B：协议与稳定性                 |
| 前置任务               | [T00](T00-protocol-baseline.md) |
| 证据类型               | 局部复现                        |
| 建档日期               | 2026-10-08                      |
| 本期范围 / 负责人 / PR | 纳入本地 P1 / Codex / 未创建 PR |

## 背景与差异

当前普通 tool.end 会提前完成工具，后续 output 又可能激活；失败结果可能被归为成功。WebClient 将普通结束、参数失败结束和最终 result 区分处理。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 对齐 start/params/end/output/result 的状态转换，先冻结事件语义。
2. 普通 end 只结束对应流，最终 result 决定业务终态，保留参数失败等明确失败分支。
3. 归一 result 中的失败信息，阻止迟到事件复活终态。
4. 将状态规则保持在纯 reducer/projector 并检查快照恢复。

## 当前项目接入点

- [src/features/chatTimeline/timelineReducer.ts](../../../../src/features/chatTimeline/timelineReducer.ts)
- [src/features/chatPersistence/chatProjector.ts](../../../../src/features/chatPersistence/chatProjector.ts)
- [src/features/chatTimeline/types.ts](../../../../src/features/chatTimeline/types.ts)

## WebClient 参考入口

- [src/features/events/lib/processors/eventProcessorTool.ts](../../../../../agent-webclient/src/features/events/lib/processors/eventProcessorTool.ts)
- [src/features/events/lib/toolOutputState.ts](../../../../../agent-webclient/src/features/events/lib/toolOutputState.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 普通 end 后尚未收到 result 时不提前成功。
- [ ] 失败 result 显示失败与原因。
- [ ] 终态后迟到 delta/output 不复活。
- [ ] 重复、乱序及历史 replay 不新增工具。
- [ ] 参数解析失败仍能正确收口。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelineReducer.test.mts](../../../../scripts/tests/chatTimelineReducer.test.mts)
- [chatProjector.test.mts](../../../../scripts/tests/chatProjector.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                           |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                |
| 范围决定与协议样本           | 工具真实终态；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                      |
| 变更文件与设计取舍           | tool.end/snapshot 只关闭参数输入；tool.result 按 failed/status/success/isError/exitCode 判断真实终态；结果或 run 真终态释放输出，迟到事件不能复活节点。 |
| 测试命令、结果与证据位置     | timelineReducer.ts、types.ts、chatWebclientSync.test.mts；覆盖 live、回放、snapshot 恢复。；总览记录正式检查结果                                        |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                     |
| 迁移与回滚方式               | 聊天缓存使用 schema 9；旧 scope 首次打开时一次性清空聊天表、对应目录快照及应用管理的资源图片缓存，新版本不重复清空，高版本拒绝降级打开；认证、来源配置、远端数据和用户原始文件保留。 |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                         |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                      |
