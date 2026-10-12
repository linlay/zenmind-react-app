# T02 Hub 短期票据授权手机访问 Desktop

Hub 通过 POST /api/desktop/route-credentials 签发 tr_ 前缀的 32 字节随机票据。只在来源账号会话有效、目标同账号未撤销且在线时签发；有效期不超过两分钟及来源访问 Token 到期时间。

Hub 内存按摘要索引票据，保存账号、来源会话、目标、请求、JTI 和时间，以及仅供 Identity /me 复验的来源 Token。最多 4096 条，访问时清理过期项；无票据数据库、Redis、签名密钥或后台清理服务。重启后旧票据失效，App 换新票据重连。

Desktop 使用 canonical SSO 向 Hub 验证票据。WS 建连和认证续期消费一次 JTI；HTTP 校验允许复用。沿用十秒业务复验、三十秒心跳复验和到期门禁，失败只关闭连接，不取消已提交任务。远端入口不接受本地 app Token 或已废弃的 desktop-route JWT。

远端授权不替换本地 Platform 主体。Desktop 退出请求 Hub 撤销登记，再停止 Tunnel 并清理本地 SSO；远端失败仍完成本地退出并提示，本地注册 ID 释放，下次显式登录重新注册。

验收：伪造、跨账号、错目标、过期、WS 重放被拒绝；HTTP 复验、退出/解绑失效、服务故障和重启恢复可复现；本地认证与任务生命周期保留。
