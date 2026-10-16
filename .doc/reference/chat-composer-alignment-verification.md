# 对话输入区对齐验收记录（2026-10-16）

实现边界：新增 useChatComposerSettings、chatComposerPreferences 两个模块；Agent 详情与能力继续共用，目录只存选项，主 Run 保存请求模型、usage 提供实际模型。已有 Chat 的模型选择不修改 Agent 默认配置。配置失效保留偏好与附件；上传使用原 API、队列和 references，补齐异步目标检查。

## 自动验证

- 778 项脚本测试通过（node --no-warnings --experimental-transform-types --test scripts/tests/*.test.mts）。
- pnpm exec tsc --noEmit、pnpm lint 通过。
- 新增测试覆盖配置缺失/关闭/恢复、新旧 Chat、预分配 ID、首次确认/失败/未知、确切 requestId 归属、跨来源迟到结果、主 Run 与 usage 的回放/快照恢复、目录错误刷新、受禁附件保留、选择器迟到、上传取消、重试及划词引用。
- 删除旧 controller 设置状态与 effects、无条件重置、能力关闭清空偏好/全部附件、目录默认设置和 recognized 兜底；保留仍被首页投影使用的 agentModelSettings。

## 真机与真实部署

设备：OnePlus 6T，当前开发实例经现有 Metro 加载工作区代码。

- 权限菜单展示默认权限、自动批准、完全访问；本地切换可用。
- 模型展示 Max M3 TH · 高；目录刷新、推理强度、速度模式及可选模型列表正常打开。
- 附件菜单显示图片、文件、引用知识库、引用聊天；文件入口可打开 Android 系统文件选择器，取消后返回。
- 实际 /api/agent 响应：modelKey=th-minimax-m3、reasoningEffort=HIGH，interactionConfig.model/accessLevel/attachment.localFiles 均为 true。没有把模拟协议响应当作实际部署证据。
- 上传成功/失败/重试/取消、运行中追加、禁止文件时保留划词等由本地协议与 Hook/service 测试验证；本轮未向真实服务上传测试文件、未发送聊天或保存 Agent 模型变更。
- 初次访问存在测试前已显示的 NativeDatabase.prepareSync 原生句柄错误；完整重启应用后恢复，没有修改数据库结构或清空聊天。
- iOS 模拟器服务不可访问，本轮未验证 iOS 真机。

## 清理

原有工作区改动按任务前备份逐项比对保留；回退仅扫描时间变化的派生文档。真机两条本次创建的空白测试会话按确切 ID 清理，未删除原有聊天；测试权限选择已通过重启清除，应用恢复首页。临时设备工具、截图和日志不进入仓库。整库导出曾被自动审批拒绝，最终通过只输出本次测试 ID/时间的窄查询完成清理，没有导出聊天数据库。
