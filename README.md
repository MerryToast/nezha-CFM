# nezha-CFM

基于 [BITJEBE/nezha-BITJEBE](https://github.com/BITJEBE/nezha-BITJEBE)（哪吒面板 `nezha-dash-v1` 视觉风格）移植并深度适配 [CF-Server-Monitor (CFSM)](https://github.com/huilang-me/CF-Server-Monitor) 的第三方前端主题。

## 功能特性

- **视觉与交互体验完整保留**：总览状态卡片、世界地图分布联动、分组标签与多维排序弹窗、卡片/紧凑表格双视图、HSL 渐变月流量进度条、自定义背景/Logo/链接、`Ctrl / ⌘ + K` 命令面板、深浅色自适应。
- **CFSM 原生协议驱动**：
  - 全量适配 `/api/config`、`/api/servers`、`/api/server`、`/api/history/all`、`/api/ws`、`/api/theme_options`，彻底移除 Komari/哪吒旧版接口及高频轮询。
  - 实时 WebSocket `batchUpdate` 增量字段合并、`<= 1s` UI 渲染节流、`document.visibilitychange` 切后台自动断流与回前台 REST 补齐、站点 `frontend_ws_timeout_minutes` 到期续连弹窗。
  - 支持公开/私密站访问控制（自动引导至 `/admin#/admin` 登录）与 Cloudflare Turnstile 人机验证（支持 `X-Turnstile-Verified` 凭证复用）。
- **扩展硬件与三网监控**：
  - 详情页直接复用 `/api/history/all` 渲染时间窗切换（`10m` ~ `7d`）、多通道三网延迟/丢包曲线（严格区分 `false` / `null` 超时 / `0` 三态）、Peak Cut 平滑开关，并按需呈现 **GPU** 与 **磁盘 I/O** 曲线。
  - 首页三网延迟状态面板直接使用 `/api/servers` 内置的 `ping` / `loss` 时序窗口，无额外逐台历史请求。
- **主题云端配置（`theme_options`）**：管理员登录后可在页面右上角打开主题设置弹窗，通过 `POST /api/theme_options` 将个性化开关与参数持久化至服务端。

---

## 快速接入 CF-Server-Monitor

### 方式一：CFSM 后台 GitHub 链接反代（推荐，同域部署）

每次执行构建后，`dist/` 与仓库根目录的 `theme/` 均会同步输出仅含 `index.html` 与 `assets/` 的干净静态产物：

1. 将本仓库推送至 GitHub，确保包含 `theme/` 目录（或启用下方 GitHub Actions 推送 `dist` 分支）。
2. 登录 CFSM 后台 → **外观设置** → **第三方主题 URL**，填入 GitHub 目录地址（Worker 会直接反代对应分支与目录）：
   - 使用主分支 `theme/` 目录：`https://github.com/<你的用户名>/<仓库名>/tree/main/theme`
   - 或使用自动构建的 `dist` 分支：`https://github.com/<你的用户名>/<仓库名>/tree/dist`
3. 保存即可生效，无需手动配置额外代理与 CORS。

### 方式二：GitHub Pages / 独立静态托管（前后端分离）

本仓库内置 [.github/workflows/build-dist.yml](./.github/workflows/build-dist.yml)，支持自动构建静态页面并**追加提交**到 `dist` 分支（保留触发源码提交说明，无 force push）：

1. 在 GitHub 仓库打开 **Settings → Actions → General → Workflow permissions**，勾选 **Read and write permissions**（`contents: write`）。
2. 在 **Settings → Secrets and variables → Actions** 中按需添加 Secrets：
   - `API_BASE`（必填）：CFSM Worker 地址（如 `https://status-worker.example.com`，多后端监控用英文逗号分隔）
   - `TITLE`（选填）：默认网页标题
   - `BACKGROUND_IMAGE`（选填）：默认背景图片 URL
   - `CSP_API` / `CSP_STATIC`（选填）：静态构建附加 CSP 白名单域名
3. 在 **Settings → Pages** 中将部署源（Source）设为 `dist` 分支根目录 `/` 并保存。
4. **⚠️ 跨域配置（必读）**：前后端分离时，必须在每个目标 CFSM Worker 的环境变量中配置 `CORS_ALLOWED_ORIGINS`（纯 Origin、英文逗号分隔，不带尾部斜杠与路径），例如：

   ```text
   https://<你的用户名>.github.io,https://status.example.com
   ```

5. **⚠️ 私密站点提示**：若 CFSM 站点关闭了公开访问（`is_public: false`），前后端分离部署会依赖跨站 Cookie 传递登录态，可能被现代浏览器（Safari ITP、无痕模式、第三方 Cookie 限制）拦截。私密站点强烈建议使用**方式一（Worker 同域反代）**。

---

## 节点增强标签语法

在 CFSM 后台编辑节点 `tags` 时，可使用英文逗号 `,` 或分号 `;` 分隔标签，并支持以下增强后缀：

| 语法 | 作用 | 示例 |
| :--- | :--- | :--- |
| `<color>` | 指定标签颜色（支持 Indigo / Blue / Teal / Green / Orange / Red / Amber 等） | `BGP<blue>; CN2 GIA<gold>` |
| `<USD>` / `<CNY>` / `<EUR>` 等 | 覆盖单节点计费币种 | `<USD>`、`<JPY>` |
| `<TRD:dd>` | 指定单节点月流量重置日（1–31） | `<TRD:15>` |

> 节点费用为 `"0"` 或 `"-1"` 时按免费处理；月流量进度条自动使用后端 `net_tx_monthly` / `net_rx_monthly` 字节字段结合 `traffic_limit`（GB 或单位字符串）与计费策略计算。

---

## 本地开发与构建

```bash
# 安装依赖
npm install

# 本地开发（默认代理 http://127.0.0.1:8787 的 CFSM Worker）
npm run dev

# 无后端时的本地 Mock 联调
VITE_USE_MOCK=true npm run dev

# 类型检查、生产构建并同步输出至 theme/
npm run build

# 代码规范检查
npm run lint
```

Windows PowerShell 若因执行策略限制无法直接调用 `npm`，请改用 `npm.cmd run build` / `npm.cmd run lint`。

## 致谢与协议

- 服务端协议规范参考：[huilang-me/CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor/)
- 视觉原型主题来自：[BITJEBE/nezha-BITJEBE](https://github.com/BITJEBE/nezha-BITJEBE)
- 开源协议见 [LICENSE](./LICENSE)
