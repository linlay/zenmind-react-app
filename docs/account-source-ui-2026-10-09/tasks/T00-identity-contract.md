# T00 账号认证与 Desktop 注册边界

2026-10-12 收敛后的现行约定：Identity 只负责账号密码登录、扫码登录挑战、登录会话、刷新和退出。手机登录 UUID 表示认证会话；Desktop 注册 ID 由 Desktop 持久保存，设备归属由 Hub 管理。

手机账号 JWT 携带稳定 account_id 和 device_id，使用 app audience 与 app/tunnel scope。Hub 验签后通过 Identity /api/auth/me 检查当前账号和登录会话有效；不使用客户端自报账号或设备身份。

Desktop 继续使用 canonical OAuth SSO 注册和连接 Tunnel。Hub 返回账号及原设备 ID，不调用 Identity 分配或签发 Desktop 身份。新注册使用 UUID，已有有效 ID 保留；显式退出清除登记并为下次登录生成新 UUID。

认证凭据与业务设备分开，不建立通用设备信任等级、设备事件中心或冻结 fixture 哈希协议。签名密钥、issuer、现网账号与云端 Platform 均不在本次迁移范围。

验收：认证/刷新/退出、并发一次性扫码领取、旧本地认证接口隔离、Hub 账号校验、登记迟到响应和两个账号的资源隔离。真实部署及账号/密钥对齐由部署前独立验证完成。
