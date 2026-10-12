# T19 聊天与 Site 上下文引用

[返回任务总览](../README.md)

| 项目                   | 内容                             |
| ---------------------- | -------------------------------- |
| 状态                   | [-] 本地实现完成，待真实联调     |
| 优先级                 | P2                               |
| 阶段                   | C：能力扩展（按范围选择）        |
| 前置任务               | [T12](T12-agent-capabilities.md) |
| 证据类型               | 静态差异                         |
| 建档日期               | 2026-10-08                       |
| 本期范围 / 负责人 / PR | 纳入本期 / Codex / 未创建 PR     |

## 背景与差异

WebClient 附件已扩展聊天与 Site 上下文引用；移动端文件型附件模型不能直接表达其 type/id/meta。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 新增类型化引用而非伪造文件 URL/文件名。
2. 按类型和稳定 ID 去重并保留 meta。
3. 将选择、发送、outbox、历史展示和权限失效串起来。
4. 为依赖 Desktop bridge 的 Site 选择明确移动端替代或能力关闭，steer 不支持时禁止透传。

## 当前项目接入点

- [src/features/chatPersistence/chatAttachmentModels.ts](../../../../src/features/chatPersistence/chatAttachmentModels.ts)
- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)
- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)

## WebClient 参考入口

- [src/features/composer/lib/composerAttachments.ts](../../../../../agent-webclient/src/features/composer/lib/composerAttachments.ts)
- [src/shared/data/api/dto/commands.ts](../../../../../agent-webclient/src/shared/data/api/dto/commands.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 相同名称不同 ID 不误合并。
- [ ] 非文件引用不触发上传。
- [ ] 过期引用有可操作提示。
- [ ] 重开仍可展示历史引用。
- [ ] 缺少选择能力不展示无效入口。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatWsTransportPayload.test.mts](../../../../scripts/tests/chatWsTransportPayload.test.mts)
- [chatProjector.test.mts](../../../../scripts/tests/chatProjector.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录（实施时填写）

| 记录项                       | 结果                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 本地实施；真实验收未完成                                                                                                                                                                                                                                                                                                                                                                                                 |
| 实际代码、参考代码与后端版本 | React HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73`（含既有未提交改动）；WebClient HEAD `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；本地 Backend HEAD `b60bbf8a67e02cb569e90e08691b0821537438c6`，只读核对。部署版本待 T00                                                                                                                                                                                                        |
| 范围决定与协议样本           | 聊天引用选择/发送/恢复/历史；Site 仅类型化历史展示，Native 无 Desktop host bridge，关闭选择并拦截重发。WebClient composerAttachments / ComposerAddMenu / desktopWebs；Backend runtime/reference/prepare.go、interaction/config.go、runtime/query/admission.go、chatresource/steer_references.go；样本固定于 chatContextReferences/chatWebclientService/chatSelectionNative 测试                                                     |
| 变更文件与设计取舍           | types、attachment models/hook/strip、按需 ChatContextReferencePicker、Composer/Card/Screen/controller、chatSourcePayload、chatSyncService、timelineReducer、i18n 与专项测试。复用 references_json/outbox/rich snapshot，不新增表/索引/全局 store/轮询。淘汰上下文走文件 URL/同名文件去重的旧路径；文件行为保留。Team canonical owner 不借成员能力，Agent 复核 chatRecords；摘要分页只取 /api/chats，避免逐项 /api/chat 加载完整事件 |
| 测试命令、结果与证据位置     | 本轮最终记录见下；node 脚本测试、pnpm exec tsc --noEmit、pnpm lint、Web 导出及 XGraph 检查。未执行会刷新 Native/品牌文件的 prepare:runtime                                                                                                                                                                                                                                                                                          |
| 真实后端 / Native 联调       | 未执行；Agent/Team、AP/Desktop 引用权限失效与真实选取/回显操作待 T00/T31。React host 测试不能代替原生手势验收                                                                                                                                                                                                                                                                                                                       |
| 迁移与回滚方式               | 无 schema 变更，沿用附件 JSON；旧 kind=file 的 context references 按 reference.type 校验，回放保留 ID/meta。回滚当前类型投影和 UI，不删库；旧版不能编辑新引用时保留数据                                                                                                                                                                                                                                                             |
| 阻塞项与后续事项             | Site selector 需要真实 Native 目录能力，目前不提供失效入口；steer 后端只允许 selection/file，因此 chat/Site 明确禁用。权限/删除最终由后端 query 校验，失败保留原引用并提示替换/移除，重开后的失败重问先恢复输入区而非盲目派发                                                                                                                                                                                                       |
| 临时状态清理与原有改动保护   | 本轮最终审计见下；无依赖/lock/配置变更，保留既有改动                                                                                                                                                                                                                                                                                                                                                                                |

## 本次范围记录

2026-10-08：继续执行完整目标，聊天引用纳入本期。选择器按 source service 查询 10 条摘要页，Agent 限当前 agentKey，Team 使用该来源的可见目录（Backend /api/chats 不支持 teamId 筛选），不伪造筛选参数。排除当前聊天、按 ID 分页合并，搜索只针对已加载摘要；不读原始消息或事件。组件按需挂载、虚拟列表，不进入正文流式热路径。

chat/site 按 type+ID 去重，标题只是展示，meta 完整保留；Site URL 不能进入文件资源预览。chat 引用 ID 随 source namespace 映射，file/selection/Site ID 保持不透明；发送前禁止跨来源和自引用。Backend 重写标题/context 时 echo 仅按 type+ID 匹配，避免重复气泡；历史与冷 rich snapshot 仍显示服务端引用。非法/失效/禁用引用不静默删除；失败正文与附件可更换后重新发送。上下文单独不能形成 query，需问题文字；steer 不支持的类型在 service 前置拒绝且不建立 pending。

本轮最终验证：定向 46/46、全量 665/665、`pnpm exec tsc --noEmit`、`pnpm lint`、Web 导出、`xgraph sync` 与 `xgraph status` 均通过。真实后端与 Native 联调未完成。

本轮清理审计：632 个基线文件中 591 个保持原哈希，41 个变化限于 T19 实现/测试、执行记录及 XGraph 派生；新增 helper、选择器和专项测试 3 个文件。暂存区完全一致，1,964 个 `.expo`/生成文件恢复或不变，无新生成产物。无依赖、lock 或配置变更；本轮临时备份、日志和 Web 导出按所有权移除并复核，原有用户改动保留。
