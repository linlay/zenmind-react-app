# T02 Hub 配置用户匹配与在线票据内存

[返回总览](../README.md) · [改造方案](../DESIGN.md)

状态：**阻塞**。前置：[T00](T00-contract-baseline.md)。交付：T03、T05。

## 目标

Hub 以官网可信用户 ID 管理电脑授权，保存 Desktop 原 Identity 票据。保持已有目录、在线 Manager、注册和撤销能力。

## 工作

1. 让 SSO_JWT_USER_ID_CLAIM 成为唯一字段来源，删除 account_id 无条件覆盖；缺字段拒绝，不回退邮箱或手机自报 ID。所有入口复用同一解析，保持已有 ownerUserId 表示。
2. 手机目录/改名/撤销/取票改用官网既有 JWT 验证与 tunnel 权限，不要求 Identity 手机 session、app audience 或调用 Identity me。
3. 在当前 Desktop ActiveTunnel 保存 platformCredential 与归属/设备/sessionId。以现有 deviceKey 和连接锁管理，不另建在线目录、票据服务或持久表。
4. tunnel.open 初次接收具名 platformCredential；注册 API 在线更新接受 platformCredential+tunnelSessionId，验证上报官网用户、DB 归属、当前连接和票据有效期后原子替换。JWT 解码只用于字段检查，不能声称已验证本地签名。
5. 旧 session 清理不能删除新连接数据；退出、撤销、断连自动清票，Hub 重启清空。过期票据取用失败，不能当在线可用凭据。
6. 原位修改 POST route-credentials：按 targetDesktopId 返回上传的 Identity credential、expiresAt、platformDeviceId、webSocketUrl、tokenMode 和 schemaVersion。移除 tr\_ 签发及旧 routeContext；目录不返回批量票据。
7. WS、公网上传、资源和移动 WebApp 同时检查可信官网用户与目标电脑当前归属；业务 Token 保持原传输，官网证明独立传输。目标仅由 Host/服务端记录决定。WebApp 按已有网关 Cookie 模式承接授权，不向 JS 暴露凭据。
8. 错误语义保持区分：未登录401、越权403/404、离线409、票据暂不可用503；服务失败不伪装空目录。撤销关闭相关 Tunnel/移动连接并清票。

## 不做

不签发新票据、不导入本地密钥、不新增 tr\_/JTI/手机会话索引、Redis、票据 DB、事件中心或品牌判断分支。

## 验收

- [ ] 两个不同用户字段配置均生效；account_id 不能覆盖配置值。
- [ ] 同用户两电脑各取正确票据；跨用户列表/取票/WS/上传/资源/WebApp 均拒绝。
- [ ] 更新与断连竞争、Hub 重启、撤销、到期和缺票行为真实覆盖。
- [ ] 原电脑注册、改名、在线、历史分享和普通 Agent 转发保持可用。
- [ ] SQLite/必要 MySQL 行为测试通过，无票据入库或日志泄露。

## 执行记录

2026-10-15：已实现配置 claim 权威解析、Manager 在线票据、当前 session 更新和各移动数据面归属校验，删除 tr_ 与 Identity me。跨用户、双电脑、缺票/到期/断线/撤销以及 race 测试通过；全量分享资产、品牌门禁基线失败和 MySQL 缺环境分别记录，见 [实施记录](../IMPLEMENTATION.md)。


2026-10-15 状态复核：本地实现/检查记录保留，真实环境验收尚未提供，当前等待用户验收证据；不以重复本地测试代替真实结果。
