# T14 运行中 steer 与确认队列

[返回任务总览](../README.md)

| 项目                   | 内容                                                         |
| ---------------------- | ------------------------------------------------------------ |
| 状态                   | [-] 基础实现完成，待真实联调                                 |
| 优先级                 | P2                                                           |
| 阶段                   | C：能力扩展（按范围选择）                                    |
| 前置任务               | [T05](T05-run-owner.md)、[T08](T08-query-continuation.md)    |
| 证据类型               | 静态差异                                                     |
| 建档日期               | 2026-10-08                                                   |
| 本期范围 / 负责人 / PR | 默认单次在途；队列/持久化/自动转换未纳入 / Codex / 未创建 PR |

## 背景与差异

WebClient 支持运行中 steer 和发送确认队列；accepted:true 只是接受请求，尚不等于 command 事件确认，当前 command 投影也需保留引用与空正文。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 在 T00 明确是否需要多项队列、重启恢复和终态后自动转 query。默认只管理当前 run 的单次在途提交；只有明确需要排队才增加 queued，不建设通用持久任务队列。
2. 使用协议确认的稳定 steerId/请求关联 ID 匹配 command 事件，限定 owner/chat/run；区分 sending、accepted 和 unknown，事件确认后移除 pending 项，由 timeline 保存 confirmed command。事件先于响应到达也不重复添加或回退。
3. 联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。
4. 只有 T00 明确纳入自动转换才在真实运行终态后处理尚未发送的 queued 项；accepted/unknown 项不得转 query。切换历史不触发转换。未纳入时不自动产生新 query，保留可由用户核对或重新发送的输入。

## 当前项目接入点

- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/features/chatTimeline/timelineReducer.ts](../../../../src/features/chatTimeline/timelineReducer.ts)
- [src/features/chatPersistence/components/Composer.tsx](../../../../src/features/chatPersistence/components/Composer.tsx)

## WebClient 参考入口

- [src/features/composer/lib/pendingSteers.ts](../../../../../agent-webclient/src/features/composer/lib/pendingSteers.ts)
- [src/features/composer/lib/steerSubmission.ts](../../../../../agent-webclient/src/features/composer/lib/steerSubmission.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 接受与确认不会重复显示两条。
- [ ] 重复事件幂等。
- [ ] 请求与事件关联 ID 明确，事件先于响应到达仍只保留一条 command。
- [ ] 拒绝恢复完整输入。
- [ ] 超时不重复 steer。
- [ ] 结束和切换会话可区分。
- [ ] 队列、持久化和自动转换仅覆盖 T00 明确范围，accepted/unknown 项不被自动重发或转 query。
- [ ] Agent/Team 各自使用正确 owner。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelineReducer.test.mts](../../../../scripts/tests/chatTimelineReducer.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 实现；真实联合验收未完成                                                                                                                                                                                                       |
| 实际代码、参考代码与后端版本 | RN/WebClient HEAD 同总览；参考 endpoints.ts 的 /api/steer、steerSubmission.ts 与 pendingSteers.ts；实际部署版本未知                                                                                                                       |
| 范围决定与协议样本           | 依原完整目标继续实施；采用第一步已明确的单次在途默认值，不启动可选 queued/持久化/自动转换                                                                                                                                                 |
| 变更文件与设计取舍           | chatSyncService/type/chatApi：source/owner/run/steerId 单次提交与 scoped pending；controller/Composer/Card：独立引导与手动核对恢复；timelineReducer/types：保留引用、附件与空正文 command；沿用现有上传/原文/snapshot，不新增状态机或队列 |
| 测试命令、结果与证据位置     | chatWebclientService 与 chatWebclientSync 新增 Team/Agent、先事件后响应、重复、拒绝、超时、结束/切换、namespace 清理、错误 owner、引用 replay/snapshot fixture；最终全量结果见总览                                                        |
| 真实后端 / Native 联调       | 待验证实际 /api/steer 支持与移动端键盘、引导/停止操作；未声称已通过                                                                                                                                                                       |
| 迁移与回滚方式               | 无 schema/依赖变更；pending 仅内存，stop/reset 清理，confirmed command 继续旧 rich snapshot；新增 references 可选字段，旧 snapshot 不受影响                                                                                               |
| 阻塞项与后续事项             | 可选多项队列/重启恢复/自动转 query 未选择；后端和 Native 联调未完成。后续 P2 按依赖继续实施                                                                                                                                               |
| 临时状态清理与原有改动保护   | 本轮开始保存当前基线；测试只读 runtime，不生成 Native/品牌文件；最终哈希/暂存区/临时日志审计见总览                                                                                                                                        |
