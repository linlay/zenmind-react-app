# T01 Hub 账号 Desktop 目录与在线状态

Hub 的 desktop_devices 是 Desktop 归属和撤销的唯一持久化来源，在线状态来自现有 Manager。Identity 不管理 Desktop 目录。

GET /api/desktop/account-devices 一次返回当前账号有效 Desktop 的 ID、名称和 online，可选 connectedAt。手机不出现在该目录；已撤销记录不返回。PATCH 同一路径加设备 ID 修改名称，DELETE 解绑；所有操作由认证账号限定。

设备解绑写入 revoked_at，保留记录、隧道历史、公网地址和分享，提交后关闭对应 Tunnel 并失效内存连接票据。注册、握手和设备访问拒绝已撤销记录，自动重连不能恢复。

App 使用单个 Hub 请求，不再合并 Identity 目录与 presence。请求失败保留已知集合，不当作设备撤销或离线。有效离线电脑仍可选择并读取所属缓存，未知状态不启动未经确认的连接。

验收：账号隔离、目录/在线一致、中文改名、解绑与断线、重连拒绝、失败不误删来源；SQLite v3 副本升级到 v4 后设备、地址、分享与资源不变。MySQL 同步增加撤销字段。
