# clash-override

一套按机器切换的 Clash / mihomo 覆写脚本。三台机器共用同一份 `main.js`，部署时只改顶部的 `MACHINE`。

## 机器

| `MACHINE` | 机器 | 客户端 | 启用的额外能力 |
| --- | --- | --- | --- |
| `home-imac` | 家里 iMac | FlClash (macOS) | Apple Music DNS 修复、Tailscale MagicDNS |
| `home-macmini` | 家里 Mac mini | FlClash (macOS) | Apple Music DNS 修复、Tailscale MagicDNS、Cloudflare Tunnel 边缘直连 |
| `windows` | Windows | Mihomo Party | Tailscale MagicDNS |

```js
const MACHINE = 'home-imac'; // 改这里：home-imac / home-macmini / windows
```

## 脚本做什么

- 按地区/用途重新分组订阅节点（HK、TW、JP、US、SG、KR、UK 等），剔除下载/测试/充值/官网这类非节点条目。
- 统一规则集：Loyalsoldier 的 reject / proxy / direct / ChinaDomain / ChinaCompanyIp 等，加上 AI 规则和自定义直连规则。
- `appleDnsFix`（两台 Mac）：修复 Apple Music 的 CNAME 链在 fake-ip 下解析失败的问题。
- `tailnetDns`（三台机器）：Tailscale MagicDNS 的 `*.ts.net` 等域名定向直连，避免被代理。
- `cfTunnelDirect`（仅 home-macmini）：把 cloudflared 连接的 CF 边缘 `198.41.192.0/24`、`198.41.200.0/24` 以及 `argotunnel.com` / `cftunnel.com` 放在规则最前面直连，并在 sniffer 里跳过这两个域名。机场节点故障时，Cloudflare Tunnel 不会再跟着掉线。

## 部署

### FlClash（home-imac / home-macmini）

1. FlClash → 配置 → 覆写 → 脚本，新建脚本，粘贴 `main.js`。
2. 把顶部 `const MACHINE` 改成对应机器。
3. 在该订阅的覆写设置里选中这个脚本，保存并重新载入配置。

脚本落盘位置：

```text
~/Library/Application Support/com.follow.clash/scripts/<script_id>.js
```

### Mihomo Party（Windows）

1. 覆写 → 新建 JS，粘贴 `main.js`，`MACHINE` 改为 `windows`。
2. 设为全局覆写（`global: true`），保存后重载配置。

脚本落盘位置：

```text
%APPDATA%\mihomo-party\override\<id>.js
```

## 注意

- 仓库只保存覆写脚本，不要提交订阅文件、节点、密钥等敏感信息。
- 改完脚本后必须重新载入配置才会生效。
- `cfTunnelDirect` 的规则依赖 cloudflared 的边缘地址；Cloudflare 调整网段时需要同步更新。
