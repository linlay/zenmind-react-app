# T24 服务端快照导出与分享

[返回任务总览](../README.md)

| 项目                   | 内容                                                           |
| ---------------------- | -------------------------------------------------------------- |
| 状态                   | [-] 本地实现通过；模板部署与 Native 联调待验收                     |
| 优先级                 | P2                                                             |
| 阶段                   | C：能力扩展（按范围选择）                                      |
| 前置任务               | [T13](T13-time-contract.md)                                    |
| 证据类型               | 静态差异                                                       |
| 建档日期               | 2026-10-08                                                     |
| 本期范围 / 负责人 / PR | 纳入本期：服务端快照文件导出及显式系统分享 / Codex / 未创建 PR |

## 背景与差异

WebClient 有基于服务端快照的完整对话导出；当前已加载列表不能代表全部历史，移动端需独立完成文件和分享链路。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 读取专用服务端快照并校验模板/资源票据/体积/版本。
2. 导出不触发 attach 或已读副作用。
3. 通过 Native 文件与分享能力交付结果，公共分享需明确用户动作。
4. 管理失败、取消和临时资源清理，记录格式兼容范围。

## 当前项目接入点

- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)
- [src/core/api/services/authenticatedResource.ts](../../../../src/core/api/services/authenticatedResource.ts)
- [src/features/chatPersistence/authenticatedResourcePreview.ts](../../../../src/features/chatPersistence/authenticatedResourcePreview.ts)

## WebClient 参考入口

- [src/shared/data/conversationExport.ts](../../../../../agent-webclient/src/shared/data/conversationExport.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 长历史导出完整。
- [ ] 资源鉴权有效且不泄露 token。
- [ ] 只读导出不改变运行/未读。
- [ ] 取消不残留临时文件。
- [ ] 未显式分享不创建公共链接。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatApiDetail.test.mts](../../../../scripts/tests/chatApiDetail.test.mts)
- [chatAttachmentResourceUrl.test.mts](../../../../scripts/tests/chatAttachmentResourceUrl.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录（实施时填写）

| 记录项                       | 结果                       |
| ---------------------------- | -------------------------- |
| 开始 / 完成日期              | 待填写                     |
| 实际代码、参考代码与后端版本 | 待填写                     |
| 范围决定与协议样本           | 待填写                     |
| 变更文件与设计取舍           | 待填写                     |
| 测试命令、结果与证据位置     | 待填写                     |
| 真实后端 / Native 联调       | 待填写                     |
| 迁移与回滚方式               | 待填写；不得以删库代替迁移 |
| 阻塞项与后续事项             | 待填写                     |
| 临时状态清理与原有改动保护   | 待填写                     |

## 本次范围记录

2026-10-08：尚未开始此 P2 能力；已提出范围与后端版本问题，尚无答复。先推进 P1，保持此任务未完成，后续由 T00 确认纳入范围。

## 契约核对与依赖准备

2026-10-08：WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`、Backend `b60bbf8a67e02cb569e90e08691b0821537438c6`。`GET /api/chat/export?chatId=...&format=snapshot` 返回完整服务端 V1 JSON；默认/markdown 返回 Markdown。服务端从 Summary/LoadChat 只读构建，包含整段历史及合法产物引用，20 MiB / 2,000 items 有界；无 PDF 导出接口。V1 attachment 只有规范化 sourceRef、SHA256、大小与 MIME，不包含授权 token/资源票据；不把缺失票据补造成公共链接。

WebClient HTML 使用专用模板，将快照嵌入 `__CONVERSATION_EXPORT_SNAPSHOT_JSON_V1__`，并填入已验证 asset origin/brand；模板最大 256 KiB、HTML/快照最大 20 MiB。Native 接入还需明确模板资产来源、profile/版本校验与实际资源认证数据面，不能用已加载列表替代快照或复用 attach/read。

当前项目有 expo-file-system，无跨平台文件分享依赖。按本机已安装 Expo SDK 56 的 `bundledNativeModules.json`（声明 `~56.0.15`），仅在 package.json 增加精确 `expo-sharing: 56.0.15`；未写 lock / node_modules、未运行安装命令，尚未增加依赖它的代码或假定已可编译的功能。已有 Web 导出和 693/693 测试结果属于 T23，不用于宣称 T24 通过。

依照 AGENTS.md 的“如需刷新 lock 文件或实际安装依赖，必须停止并提示用户手动执行”，此处停止 T24 接入。用户在项目根目录手动执行 `pnpm install` 后告知；Native 二进制也需使用现有 `pnpm android` / `pnpm ios` 重建以纳入模块。之后继续只读快照、HTML/Markdown 文件与明确分享动作的实现及取消清理验证；全目标未完成。

本次依赖准备只保留 package.json 声明、T24/总览/XGraph 记录，无临时配置。清理 audit 复核原有变更与暂存区，移除自建基线。此处没有 Native 文件可分享，也不创建公共链接。

## 用户安装后继续实施（最新状态）

2026-10-08：用户确认独立安装完成；实际 expo-sharing 56.0.15 已可解析。开始前记录当前工作树、暂存区及用户更新后的 pnpm-lock.yaml 哈希，AI 本轮不安装依赖、不修改 package/lock。T25 与 BTW 专项继续暂跳过。

已接入 ChatExportMenu、core chatExport/service/protocol 及 Native/Web 文件交付。默认源按 conversation namespace 的 sourceId 绑定配置 API/凭据，GET /api/chat/export?chatId=<remote>&format=markdown 或 snapshot 读取服务端完整历史，不经过详情分页、attach、read 或 SQLite。paired 来源的数据面尚未冻结，显式 unavailable，不借用默认源或当前 Desktop/Identity 的认证。

联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。

HTML 使用公开构建变量 EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN（仅 HTTPS origin，无路径/凭据/query），从该域名 /assets/conversation-export/conversation.template.html 无凭据读取模板。未配置时只提供 Markdown。校验模板 profile conversation-snapshot-json-v2、asset-set、嵌入 marker 和 256 KiB 限制，快照须 V1/毫秒时间/合法节点及 canonical artifacts/<run>/<file>、SHA256/大小；拒绝 credential/ticket 字段。插入 JSON 前转义 script 结束符且不改变正文中的模板标记或替换符。已读取同级 WebClient dist/export 实际模板，本地兼容生成 70,114 字节；部署域名与实际资源认证仍待用户提供/联调，不自动假定 assets 域名或生产版本。

Native 保存走用户目录，不覆盖已有文件；失败/等待取消仅删除自己创建的目标。分享使用唯一 cache 目录，只在用户明确点击后调用系统文件分享；系统窗口结束后 finally 删除目录，关闭页面不会提前撤销仍在系统使用的文件。Web 保存回收 Blob URL，文件分享按浏览器能力显式失败；未创建公共链接或复制产物二进制。进程被强杀后的系统 cache 回收及 Android 目标应用异步读取仍须真实设备验收，不能由 mock 测试宣称完成。

联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。

未关闭项：真实部署/AP/Desktop/Agent/Team 的长历史与资源认证、HTML 资产域名/版本、Native 重建后的保存/分享/取消。无 storage 迁移，回滚删除本次能力入口及文件即可，不需删库；用户安装后的 lock 保留。

### 本轮验证与清理审计

2026-10-08：专项 13/13、全量 pnpm test 715/715、严格 tsc（含 noUnusedLocals/noUnusedParameters）、pnpm lint、生产 Web 与 Android 静态导出、实际 WebClient HTML 模板兼容均通过；静态导出不等于 Native 二进制重建或真实分享验收。XGraph index/sync/status 通过。所有新增代码均接入实际入口，没有未使用的旧版导出实现或空框架。

2,009 个已记录的项目生成/Native 文件中，仅 .expo/dev/logs/export.log 被本次导出写入，已从任务前副本恢复；没有新生成文件。用户安装后的 package/lock、暂存区、Git 配置及范围外原有业务改动保持原样。自建 Web/Android 导出、日志和临时备份将在最终审计后删除。

**清理审计保留项，不能记为完全恢复：**仓库现有 pnpm prepare:bundle 会重建 node_modules 内 react-native-worklets/.worklets 的 1,927 个构建缓存。此前只备份了项目生成物，未记录包内缓存的任务前原始哈希；不伪称按原字节恢复。重建后的 1,927 个文件与任务前 .generated/react-native-worklets/.worklets 项目副本逐一匹配（按原有 import 路径重映射比较），Android 导出未再改变包内缓存。该缓存保留，不删除所有权不明确的安装产物；完整清理审计与整个目标仍未关闭。

保留路径为 /Users/ther/project/zenmind-workspace/zenmind-react-app/node_modules/.pnpm/react-native-worklets@0.8.3_ksoiso4lpwamioqvult67vlgpy_dcfvlxbpaung5ijf4xc6euq5aa/node_modules/react-native-worklets/.worklets。若用户持有任务前该目录的完整备份，可手动用 `rsync -a --delete /path/to/pre-task-worklets/ /Users/ther/project/zenmind-workspace/zenmind-react-app/node_modules/react-native-worklets/.worklets/` 恢复并核对；没有原目录备份时不能证明精确撤回。`pnpm prepare:bundle` 仅重现当前源码一致的缓存，不是原字节恢复命令。后续构建前须先记录包内缓存。

最终审计：662 个基线文件中 637 个保持原哈希，25 个变化限于 T24 入口/中英文、执行记录和 XGraph 派生；新增 8 个接入/协议/平台声明及专项测试文件。2,009 个项目生成/Native 文件恢复或不变，无新生成文件，package/lock/暂存区与原有 authRequestModel 删除保持用户原状；本轮自建临时目录（含导出、日志、基线、复制的缓存备份）已移除并验证。包内 Worklets 缓存按上述审计保留，未宣称精确恢复；整体清理审计仍不完整。
