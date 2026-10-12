# 本地契约核实与实施决定（2026-10-09）

最新范围：云端保持现状，T03 暂缓。App 云端沿用现有 Token/Cookie 契约；Platform 任务补丁已逐项撤除，工作区干净，App 云端恢复现有 authMode/accessToken。以下保留此前本地核实与实施记录，不代表已部署；真实环境联调与真机验收由用户执行。

## 已核实的边界

- Identity 的账号 App JWT 已由现有 RS256 key 签名，含稳定 `account_id`、手机 `device_id`、`app tunnel` scope；每次账号设备 API 都重新校验 ACTIVE 设备。
- Desktop canonical OAuth JWT 的 `sub` 是同一个稳定用户 ID，`aud` 为 `app-api`；手机 JWT 的 `sub` 是用户名，因此 Hub 账号设备链路不能把手机的 `sub` 当账号 ID；云端凭证解析按现有契约保持原状。
- Hub 目前只有设备注册/公网转发，没有 App 所请求的 `account-presence` 与 `route-credentials`。在线真源已有 `proxy.Manager.ActiveFor(DesktopConnectionKey(deviceKey))`，不能用 lastSeen 或注册成功推断在线。
- Desktop 本地 Platform 使用本地 Identity key 与安装身份；不能直接接受账号 Identity JWT、改写本地用户或复制聊天数据。
- App 的旧协调器同时启动默认源与 Desktop，旧 scope mapper 匹配历史 Profile。实施改为账号云端/账号电脑独立新 SQLite 文件，首次清除旧数据库、目录快照、旧 Profile 凭据及旧映射，不迁移历史。

## 设备与电脑授权的服务端最小接入决定

复用 Identity 现有 key、账号设备表和 OAuth 事实源。Hub 只负责实际在线检测、已有随机公网 host 与凭证转发；不持有新私钥。

Desktop 通过 canonical OAuth 登录在 Identity 登记账号电脑，返回服务端 UUID。该 UUID 只作为 Tunnel 注册身份，继续使用既有 Tunnel 设置保存；本地 Platform 安装身份与数据保持不变。Hub 注册返回 canonical UUID，后续重连复用它；撤销的同账号电脑不自动重新激活。

Hub 签发入口代理 Identity 签发两分钟 `desktop-route` JWT，绑定账号、手机、目标电脑、requestId、jti 与设备 stateVersion。接收端通过既有可信 Hub origin 请求 Identity 补偿校验，只有所属账号当前有效 Desktop canonical OAuth 会话可以校验；再沿现有本地 token issuer 取得本地主体。接收端按十秒窗口单飞复验有效性，推送连接按三十秒心跳复验；只失效这条手机连接，不停止 Desktop tunnel 或远端任务。WS 初次认证消费 JTI；HTTP 数据面补偿验证不重复消费 WS JTI。

Hub 新账号接口需要显式配置 Identity API base URL，不能从 issuer 猜 API 路径。未配置或任一权威状态未知时失败关闭。

## 当前实施状态

App 认证/用户页/来源 scope/单源协调器/来源抽屉已实施。Identity 已获用户明确授权，补丁已应用原仓库并通过 `make backend-test` 全量测试；Hub 与 Desktop 的本地实现已通过自动审批并写入原仓库。用户确认云端只有一个 Platform。此前 T03 补丁已应用，现按最新决定暂缓并逐项撤除；云端不新增 Identity base、issuer 或验签配置要求。App 云端认证已按现有契约收敛，手机 JWT 不发往云端；Desktop 远端撤销失败仍完成本地退出，相关回归通过。真实验收由用户执行。最终检查与清理审计见执行状态记录。
