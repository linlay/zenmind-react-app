# T20 图像生成结果专用投影

[返回任务总览](../README.md)

| 项目                   | 内容                         |
| ---------------------- | ---------------------------- |
| 状态                   | [-] 本地实现完成，待真实联调 |
| 优先级                 | P2                           |
| 阶段                   | C：能力扩展（按范围选择）    |
| 前置任务               | [T01](T01-tool-lifecycle.md) |
| 证据类型               | 静态差异                     |
| 建档日期               | 2026-10-08                   |
| 本期范围 / 负责人 / PR | 纳入本期 / Codex / 未创建 PR |

## 背景与差异

WebClient 对 image_generate 使用专用多图状态投影；通用工具 JSON 展示无法准确表达多图部分成功和恢复中状态。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 从现有工具节点的请求 n、result 的 index/operation/ok 及对应 run 状态纯派生稳定图槽；不依赖临时 stdout/stderr，不建立第二份图像生成状态或专用持久化。
2. 处理部分失败、缺失与恢复中，不从不可信路径猜测图片。
3. 使用现有鉴权资源链加载实际资源。
4. 工具折叠与生成图片展示分离，并支持历史恢复。

## 当前项目接入点

- [src/features/chatPersistence/components/RuntimeTimelineRow.tsx](../../../../src/features/chatPersistence/components/RuntimeTimelineRow.tsx)
- [src/features/chatPersistence/components/runtimeStructuredPayload.ts](../../../../src/features/chatPersistence/components/runtimeStructuredPayload.ts)
- [src/features/chatPersistence/authenticatedResourcePreview.ts](../../../../src/features/chatPersistence/authenticatedResourcePreview.ts)

## WebClient 参考入口

- [src/features/timeline/lib/imageGenerationDisplay.ts](../../../../../agent-webclient/src/features/timeline/lib/imageGenerationDisplay.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 图槽稳定不跳号。
- [ ] 部分成功不会全部标失败。
- [ ] 失败图有原因。
- [ ] 折叠工具仍可查看产物。
- [ ] 历史恢复与实时结果一致。
- [ ] T02 未实施时仍可展示；图像状态从已有工具/run 数据派生，无重复状态存储。
- [ ] 图片不绕过鉴权。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatTimelinePresentation.test.mts](../../../../scripts/tests/chatTimelinePresentation.test.mts)
- [chatAttachmentPreview.test.mts](../../../../scripts/tests/chatAttachmentPreview.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录（实施时填写）

| 记录项                       | 结果                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 本地实施；真实验收未完成                                                                                                                                                                                                                                                                                                                                                                                               |
| 实际代码、参考代码与后端版本 | React HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73`（含既有未提交改动）；WebClient HEAD `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；本地 Backend HEAD `b60bbf8a67e02cb569e90e08691b0821537438c6` 只读核对；部署版本待 T00                                                                                                                                                                                                       |
| 范围决定与协议样本           | WebClient imageGenerationDisplay/ImageGenerationCard 与资源 URL 协议；Backend tools/tool_image_generate.go、chat/resource_key.go、handler_resource.go。n 限 1–4、结果 images[index/url/name/ok/error]、operation、ok/message 及现有 run/tool lifecycle；样本固定于 chatImageGeneration.test.mts。当前本地 Backend materialize 失败整体报错，部分成功样本为投影回归契约，不等同部署实际返回                                        |
| 变更文件与设计取舍           | 新增纯 chatImageGeneration helper 和 ChatImageGeneration 组件，RuntimeTimelineRow/ChatTimelineList 接入，timelinePresentation 将 image_generate 留在折叠过程外，补 i18n 与专项测试。不改 reducer/schema/transport；复用已有 argsText/resultText、rich snapshot、鉴权图片缓存及预览。单工具最多 4 槽、JSON 单字段最多 64 Ki 字符，分组图片用横向 FlatList，首屏 2、批次 4、windowSize=3；无临时 stdout/stderr 依赖或另一份生成状态 |
| 测试命令、结果与证据位置     | 最终结果见下；node 专项/全量脚本、pnpm exec tsc --noEmit、pnpm lint、Web 导出与 XGraph；未执行 prepare:runtime，不写依赖/Native 生成文件                                                                                                                                                                                                                                                                                          |
| 真实后端 / Native 联调       | 未执行；真实 AP/Desktop 生成/编辑/重绘、资源权限与横向虚拟列表/图片预览手势待 T00/T31。host 测试不能代替原生验收                                                                                                                                                                                                                                                                                                                  |
| 迁移与回滚方式               | 无新增持久化；历史只从现有工具节点和对应 run 复原，无删库。回滚 UI/纯 helper 和 process 展示规则，原始 tool result 不受影响                                                                                                                                                                                                                                                                                                       |
| 阻塞项与后续事项             | Native Desktop WS HTTP 资源数据面仍沿用现有 unsupported_transport 失败，禁止绕过鉴权。后端 url 才是资源，path/relativePath/stdout 不猜图；无 URL 或非法路径显示缺失。资源加载失败可重试/预览；失败图显示原因，无详情时明确说明                                                                                                                                                                                                    |
| 临时状态清理与原有改动保护   | 最终审计见下；未新增依赖、配置或 Git 状态变更，既有改动保留                                                                                                                                                                                                                                                                                                                                                                       |

## 本次范围记录

2026-10-08：继续完整目标，T20 纳入本期。图槽由请求 n、result index/operation/ok 和对应 run/tool 状态纯派生；索引始终从 0 对应原图槽，不因乱序或缺失跳号，以 conversation/run/tool/index 形成稳定键。每个图槽独立判断，成功 URL 在其他槽失败或 run 取消后仍可见；具体失败取每槽错误，再取工具结果 message/error。无结果时，活动 streaming 工具显示准备/生成/编辑/重绘，已恢复的非 streaming 活动工具等待结果恢复，真实终态或完成而缺图则明确缺失。

只接受安全 chat-relative URL 并按当前 remote chatId 构造鉴权 /api/resource 请求；编码 URI 保持单次解码契约，旧同聊天 /api/resource?file= URL 规范化后可恢复。跨聊天 legacy key、外链、inline URL、绝对内部路径、目录穿越和路径字段均不用于加载。现有鉴权缓存负责取消、引用计数、限额和释放，gallery 不创建下载管理器或轮询。工具载荷折叠/整轮 process 折叠均不隐藏生成产物；实时、历史 replay、冷 rich snapshot 使用相同投影。T02 文本输出面板不参与该链路。

本轮最终验证：定向 18/18、全量 670/670、`pnpm exec tsc --noEmit`、`pnpm lint`、Web 导出、`xgraph sync` 与 `xgraph status` 均通过；真实后端与 Native 联调未完成。

本轮清理审计：635 个基线文件中 608 个保持原哈希，27 个变化限于 T20 实现/测试、执行记录与 XGraph 派生；新增投影 helper、gallery 和专项测试 3 个文件。暂存区完全一致，1,964 个 `.expo`/生成文件恢复或不变，无新生成产物；本轮临时基线、生成备份、日志和 Web 导出按所有权移除并复核。无依赖、lock、配置或 Git 分支变更，原有用户改动保留。
