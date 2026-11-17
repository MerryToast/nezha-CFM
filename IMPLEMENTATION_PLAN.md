# `nezha-BITJEBE` 移植适配 `CF-Server-Monitor` 执行方案文档

> **文档目标**：本文档为后续执行 Agent（Hydrogen）提供清晰、无歧义的端到端开发规范、任务边界与分阶段执行步骤，目标是以 [`BITJEBE/nezha-BITJEBE`](https://github.com/BITJEBE/nezha-BITJEBE) 为 UI/交互原型，打造一款完全符合 [`huilang-me/CF-Server-Monitor`](https://github.com/huilang-me/CF-Server-Monitor) 第三方主题规范（`theme-develop.md` 与 `theme-ai-prompt.md`）的高性能探针主题。

---

## 一、 核心目标（Project Goals）

1. **视觉与交互 1:1 还原**：完整保留 `nezha-BITJEBE`（基于 `nezha-dash-v1`）的现代化设计语言，包括顶部全局概览卡片、可折叠全球节点分布地图、分组筛选栏、列表/卡片双视图切换、内置 HSL 渐变流量进度条、增强型彩色标签（`<color>` 语法与 Hash 自动配色）以及深浅色主题切换。
2. **数据层彻底替换为 CFSM 架构**：剥离原项目对 Komari 后端（RPC / `komari-theme.json`）的全部依赖，对接 `CF-Server-Monitor` 的 REST API 与 Durable Objects WebSocket（`/api/ws`）实时增量流。
3. **严守 CFSM 性能与安全铁律**：
   - **D1 数据库零轮询**：首屏仅拉取一次 `GET /api/config` 与 `GET /api/servers`，后续实时状态完全由 `/api/ws` 的 `batchUpdate` 消息驱动更新；单机历史数据仅在进入详情页时按需请求一次。
   - **CSP 零外部依赖冲突**：移除不合规第三方 CDN；字体/地图/UI 组件打包进本地 `assets/`，国旗与操作系统图标复用 CFSM 内置静态路径 `/flags/<code>.svg` 与 `/os-icons/<filename>`（并辅以本地兜底组件），静态构建通过 `CSP_API` / `CSP_STATIC` 生成独立 CSP 策略而不污染 `API_BASE`。
   - **完整鉴权与验证兼容**：支持多后端独立配置的私有站点（`is_public: false`）JWT 鉴权、未登录跳转 `/admin#/admin`，以及 Cloudflare Turnstile 逐站验证与 `X-Turnstile-Verified` 凭证缓存复用。
4. **合规构建产物输出**：构建产物严格遵循 CFSM 第三方主题目录规范（根目录 `index.html` + `assets/` 静态资源目录），可直接用于 GitHub 反代托管或提交至 `CFSM-Theme-Store`。

---

## 二、 任务边界定义（Task Boundaries）

为保证执行过程聚焦、不越界，明确划分以下任务边界：

### ✅ 范围内任务（In-Scope）
1. **前端工程初始化与清理**：拉取 `BITJEBE/nezha-BITJEBE` 源码至工作区 `e:\VS_code\Github_proj\nezha-CFM`，并拉取或读取 `huilang-me/CF-Server-Monitor` 中的 `theme-develop.md`、`theme-ai-prompt.md`、`API.md` 作为权威接口字典；移除 Komari 专属 RPC、Websocket 及 `komari-theme.json`。
2. **路由改造**：强制采用 Hash 路由体系：
   - 首页大盘：`/#/`（兼容 `/#`）
   - 节点详情页：`/#/server/:id`
   - 管理后台入口：外链跳转至 `/admin#/admin`
3. **CFSM 数据通信层（Adapter & Store）开发**：
   - 对接 `GET /api/config`、`GET /api/servers`、`GET /api/server?id=:id`、`GET /api/history/all?id=:id&hours=0.167`（默认 `0.167` 即 10 分钟，按需切换时间窗口）、`POST /api/theme_options`。
   - 对接 `GET /api/ws?subscribe=all`（首页）与 `subscribe=<id>`（详情页）WebSocket 实时流，处理 `batchUpdate` 增量合并、1 秒渲染节流、断线指数退避重连、`frontend_ws_timeout_minutes` 超时弹窗及 `document.visibilitychange` 后台断流/回前台 REST 补齐。
4. **核心业务组件改造**：
   - **流量进度条**：对接 CFSM 的月度计数 `net_tx_monthly`、`net_rx_monthly` 结合 `traffic_limit`、`traffic_calc_type`、`reset_day` 及 `sysConfig.show_tf`（开机累计 `net_rx` / `net_tx` 仅用于总流量展示，不可混作月度配额进度）。
   - **增强标签栏**：解析 CFSM 的 `tags`（同时兼容 `,` 与 `;` 分隔符及 `Tag<color>` / `<CURRENCY>` / `<TRD:day>` 语法），并融合展示 `price`（`"0"` 与 `"-1"` 均映射为免费，空白表示未设置）、`expire_date`（受所属站点 `sysConfig.show_price` / `show_expire` 控制）。
   - **详情页监控图表**：进入详情页默认请求 `GET /api/history/all?id=:id&hours=0.167`（10 分钟）渲染 CPU、内存、磁盘 IO、GPU（如有）及多通道三网/自定义节点延迟趋势；切换 `30m/1h/6h/12h/24h/2d/4d/7d` 时加请求序号防竞态（公开站 `hours > 24` 返回 `401` 仅在详情页局部提示登录而不触发整页锁屏）；首页三网监测面板仅使用 `/api/servers` 自带的 `ping` / `loss` 数组。
   - **主题外观配置面板**：保持基于 React 的视觉底座与独立轻量化设置弹窗，读取 `config.theme_options`，管理员通过 `POST /api/theme_options` 保存到服务端（访客仅作会话预览，不扩展后台管理功能）。
5. **私有站点鉴权与 Turnstile 适配**：处理 401 状态码、JWT Token（`cfsm_auth` Cookie / `localStorage` / `Authorization: Bearer`）以及 `X-Turnstile-Token` 验证流程。
6. **Vite 构建与交付物整理**：调整 `vite.config.ts`，确保打包输出符合 `index.html` + `assets/` 规范，并提供本地 Mock 联调或构建验证。

### ❌ 范围外任务（Out-of-Scope — 严禁执行）
1. **不开发管理后台页面**：根据 CFSM 规范，管理后台（`/admin#/admin`）始终由 Worker 内置主题接管，本主题**严禁**实现节点增删改、Agent 参数下发、告警配置等后台管理页面。
2. **不修改 CFSM 服务端代码**：所有适配工作均在前端主题层完成，不修改 Cloudflare Worker 后端逻辑或数据库 Schema。
3. **不保留外部脚本注入或未授权外部 CDN**：不引入任何违反 CFSM 默认 CSP 策略的第三方远程脚本，组件/字体等本地资源打包在 `assets/` 中，国旗与 OS 图标统一引用 Worker 静态目录 `/flags/` 与 `/os-icons/`。
4. **严禁定时 REST 轮询**：任何情况下（含 WS 断开、超时或后台切回后）均严禁使用 `setInterval` 定时轮询 `/api/servers` 或 `/api/history/all`；无新样本时的 5 分钟离线判定由本地时间戳对比推进，仅在 `document.visibilitychange` 从后台切回可见时按需执行一次 REST 补齐。

---

## 三、 核心数据字段精确映射规范

执行开发时，请在 `src/lib/cfsm-adapter.ts`（或同类文件）中严格按以下映射规则将 `CF-Server-Monitor` 的响应转换为 `nezha-BITJEBE` 组件所需的数据结构：

### 1. 全局配置与开关映射 (`GET /api/config` + `GET /api/servers -> sysConfig`)

| 原主题 (`nezha-BITJEBE`) 属性 | CFSM 数据源字段 | 转换与回退逻辑 |
| :--- | :--- | :--- |
| 站点名称 / 副标题 | `config.site_title` / `theme_options.site_desc` | 优先取 `theme_options` 自定义值，回退到 `/api/config` 的 `site_title` 及默认文案 |
| 是否公开可访问 | `config.is_public` | 按站点独立检测：存在未认证私有站点时展示登录引导或跳转 `/admin#/admin`；全公开时 `authorization` 仅代表主站登录态 |
| Turnstile 配置 | `config.turnstile_enabled`, `config.turnstile_site_key` | 按 `apiBase` 分站存储凭证并在验证门禁中逐站校验，避免多后端凭证混用 |
| 显示价格标签 | `sysConfig.show_price` | 按节点所属站点 `sysConfig` 控制；`price` 为 `"0"` 或 `"-1"` 均显示免费，空白表示未配置 |
| 显示到期倒计时 | `sysConfig.show_expire` | 为 `true` 且节点 `expire_date` 非空时，计算剩余天数并渲染到期徽章 |
| 显示月度流量条 | `sysConfig.show_tf` | 按所属站点 `show_tf` 与 `theme_options.show_traffic_bar` 控制，基于月度流量渲染进度条 |
| 显示三网延迟详情 | `sysConfig.show_three_net_details` | 按节点所属站点开关在首页/详情页展示电信(`ct`)、联通(`cu`)、移动(`cm`)、广电/BGP(`bd`) 延迟曲线 |
| 默认显示模式 | `sysConfig.display_mode` / `theme_options` | 映射卡片视图（grid/bar）或列表视图（table/compact） |

### 2. 单机指标与属性映射 (`servers[]` & WebSocket `batchUpdate`)

| 原主题节点字段 | CFSM `servers[]` 字段 | 类型与单位处理说明 |
| :--- | :--- | :--- |
| `id` | `id` (UUID string) | 注意：原主题 ID 为 number，已将 TS 类型全面拓宽为 UUID `string` |
| `name` | `name` | 节点显示名称 |
| `group` | `server_group` | 用于顶部按分组 Tab 过滤；为空时仅在 `All` 视图展示 |
| `tags` | `tags` | 字符串，支持 `,` 和 `;` 双分隔符拆解，支持 `<color>`、`<CURRENCY>`、`<TRD:day>` |
| `country_code` | `region` | ISO 两位国家/地区代码（小写请求 `/flags/<code>.svg`，大写匹配地图 `regionStats`） |
| `online` | `online` / `last_updated` | 按最后上报时间戳与当前时钟 `< 300s` 动态判定在线状态（本地定时器随时间自动过期，不依赖额外 REST） |
| `cpu` | `cpu` | 百分比数值（`0 - 100`） |
| `mem_total` / `mem_used` | `ram_total` / `ram_used` | **单位规范**：CFSM 数值明确以 **MB** 为单位（字符串支持带单位如 `"2GB"`），通过 `parseMemoryOrDiskToBytes()` 转换为 Bytes |
| `swap_total` / `swap_used` | `swap_total` / `swap_used` | 同上，纯数字按 **MB** 转换为 Bytes |
| `disk_total` / `disk_used` | `disk_total` / `disk_used` | 同上，纯数字按 **MB** 转换为 Bytes |
| `net_in_speed` / `net_out_speed` | `net_in_speed` / `net_out_speed` | 实时下行/上行速率（Bytes/s） |
| `net_in_transfer` / `net_out_transfer` | `net_rx` / `net_tx` | 节点累计上传与下载流量（Bytes）；全局总流量聚合包含全部可见在线与离线节点 |
| 月度已用流量 | `net_rx_monthly` / `net_tx_monthly` | **月度流量配额专用**：进度条百分比严格基于本月计数与 `traffic_calc_type` 计算 |
| `traffic_limit` | `traffic_limit` | 纯数字按 **GB** 解析（兼容 `"1TB"` / `"500GB"` 等单位字符串）为 Bytes 上限 |
| `traffic_limit_type` | `traffic_calc_type` | 映射 CFSM 计算类型（`sum`/`total`、`max`、`min`、`up`、`down`） |
| `expired_at` / `traffic_reset_day` | `expire_date` / `reset_day` | `expire_date` 用于到期计算；`reset_day`（1-31）一次性归一化为 `traffic_reset_day` 后供各视图直接读取 |
| `uptime` | `uptime` | 在线秒数 |
| `os` / `arch` / `load` | `os` / `arch` / `load_avg` | 系统匹配 `/os-icons/<filename>` 静态图标（带本地 SVG 兜底）、架构与 `1m/5m/15m` 负载 |

---

## 四、 分阶段执行步骤（Step-by-Step Execution Plan）

请严格按照以下 6 个阶段顺序推进：

### 阶段 1：源码拉取与参考规范研读
1. 在工作区 `e:\VS_code\Github_proj\nezha-CFM` 中拉取两个仓库的代码/文档：
   - 克隆 `https://github.com/BITJEBE/nezha-BITJEBE` 作为前端工程底座。
   - 获取 `https://github.com/huilang-me/CF-Server-Monitor` 的 `theme-develop.md`、`theme-ai-prompt.md` 与 `API.md`（可存放在项目 `docs/` 目录供随时核对）。
2. 仔细阅读 `theme-develop.md` 与 `theme-ai-prompt.md` 中的所有字段定义、WebSocket 帧格式及完工自查清单，确保无遗漏。
3. 清理 `nezha-BITJEBE` 中与 Komari 绑定的无用文件（如 `komari-theme.json`、Komari 专用 RPC 客户端代码）。

### 阶段 2：构建配置与路由规范化
1. 检查并修改 `vite.config.ts`：
   - 确保构建输出目录结构为根目录 `index.html` + `assets/`。
   - 检查静态资源引用路径，确保在 Worker 反代环境下（根路径 `/`）静态资源加载正常。
2. 检查并修改路由配置（`src/App.tsx` 或路由入口）：
   - 采用 `HashRouter`。
   - 确认首页路径为 `/#/`，单机详情页路径为 `/#/server/:id`。
   - 将导航栏中的“管理后台/登录”按钮链接指向 `/admin#/admin`。
3. 检查外部资源引用（`index.html` 与 CSS）：
   - 移除任何可能触发 CSP 拦截的非常规第三方外链，保留 本地打包的 `assets/`（如字体/地图）并与 Worker 静态目录 `/flags/`、`/os-icons/` 协同；配置独立的 `CSP_API` 与 `CSP_STATIC` 白名单。

### 阶段 3：开发 CFSM 核心数据层与 WebSocket 引擎
1. 创建 `src/api/cfsm-client.ts`：
   - 实现统一的 `fetchCFSM` 封装，自动处理 JWT Token（支持 Cookie 或 `localStorage`）和按后端隔离的 `X-Turnstile-Token` / `X-Turnstile-Verified` 请求头。
   - 实现 `fetchConfigOnce()` (`GET /api/config`)、`fetchServersAll()` (`GET /api/servers`)、`fetchServerDetail(id)` (`GET /api/server?id=`)、`fetchServerHistory(id, hours=0.167)` (`GET /api/history/all`)、`saveThemeOptions(options)` (`POST /api/theme_options`)。
2. 创建 `src/lib/cfsm-normalizer.ts`：
   - 编写明确的单位解析器 `parseMemoryOrDiskToBytes()`（数字默认 MB）与 `parseTrafficLimitToBytes()`（数字默认 GB）。
   - 将 `/api/servers` 返回的 `servers`、按站保留的 `sysConfig`、`stats` 与 `regionStats` 转换为前端统一 Store 模型。
   - 将节点 ID 相关类型全面统一为 UUID `string`。
3. 创建 `src/hooks/useCFSMWebSocket.ts` 及 `src/context/cfsm-provider.tsx`：
   - 初始化时首页仅通过单一受并发合并保护的入口调用一次 `/api/config` 与 `/api/servers`。
   - 建立 `ws(s)://<host>/api/ws?subscribe=all`（详情页为 `subscribe=<id>`，跨域模式下附加 `?token=<jwt>`）。
   - 监听 `type === "batchUpdate"` 消息按 `id` 增量合并更新，并以 1 秒定时节流刷入 UI 同时监测超过 300 秒无新样本节点的自动过期离线。
   - 实现断线指数退避重连机制、`frontend_ws_timeout_minutes` 超时续连弹窗及页面不可见断流优化。

### 阶段 4：核心 UI 组件对接与特性改造
1. **顶部概览与全球地图 (`Overview` & `ServerMap`)**：
   - `All` 视图直接使用后端/增量同步的全局 `stats`；分组视图下累计流量统计包含组内所有离线与在线节点、实时网速仅统计在线节点。
2. **服务器卡片与流量进度条 (`ServerCard` / `ServerCardInline`)**：
   - 对接内置流量进度条组件：严格采用月度字段 `net_tx_monthly` / `net_rx_monthly`，结合 `traffic_limit` / `traffic_calc_type` / 已归一化 `traffic_reset_day` 渲染 HSL 渐变条。
3. **增强标签解析器 (`TagBadge` / `parseTags`)**：
   - 支持 `,` 与 `;` 分隔符，支持 `<color>` 自定义 Radix UI 颜色、`<CURRENCY>` 币种覆盖及 `<TRD:day>` 重置日覆盖；`price` `"0"` 与 `"-1"` 均显示免费标签，配合 `expire_date` 计算到期剩余天数。
4. **单机详情页 (`ServerDetail` - `/#/server/:id`)**：
   - 进入页面默认按需调用一次 `GET /api/history/all?id=:id&hours=0.167`（10 分钟，并做请求序号防竞态与短时内存缓存），支持切换 `10m` ~ `7d` 时间范围；公开站请求 `hours > 24` 返回 `401` 时保留短历史并在详情区域提示登录。
   - 渲染 CPU、内存/Swap、磁盘、负载、网络速率、连接数、进程数、磁盘 IO 与 GPU（按需显示）趋势图，及包含 `Timeout` 三态处理的多通道网络延迟/丢包图。
5. **主题自定义设置面板 (`ThemeSettingsModal`)**：
   - 保留现有 React 视觉底座并将实用外观项提取为前端轻量设置弹窗；不扩展后台管理功能。
   - 读取 `/api/config` 中的 `theme_options` 作为默认值；管理员调用 `POST /api/theme_options` 持久化到服务端，未登录访客仅作会话临时预览。

### 阶段 5：鉴权、Turnstile 与边界状态打磨
1. **私有模式（Private Site）处理**：当 `/api/config` 返回 `is_public === false` 且 `/api/servers` 返回 `401` 时，展示优雅的锁屏/登录提示界面，引导用户前往 `/admin#/admin` 登录或输入访问凭证。
2. **Turnstile 验证支持**：当 `turnstile_enabled === true` 时，按 `theme-develop.md` 规范加载 Cloudflare Turnstile 脚本（CFSM 默认 CSP 已放行 `challenges.cloudflare.com`），获取 Token 后附加至请求头。
3. **空状态与容错处理**：当节点列表为空、单个节点从未上报数据（字段为 `null`/`0`）、未开启三网监控（`ping: []`）或未设置流量配额（`traffic_limit` 为空）时，确保界面优雅降级、不出现 `NaN%` 或白屏崩溃。

### 阶段 6：本地构建、自查验证与交付
1. 运行 `npm run build`（或 `pnpm build`），检查 `TypeScript` 编译零错误，构建产物目录符合 `index.html` + `assets/` 结构。
2. 对照 `CF-Server-Monitor` 的 `theme-ai-prompt.md` 完工自查清单逐项核验。
3. 编写清晰的 `README.md`，说明主题特性、在 `CF-Server-Monitor` 后台的配置方法（GitHub Tree 地址引入方式）、彩色标签语法说明及流量进度条配置指南。

---

## 五、 验收标准（Acceptance Criteria）

- [ ] **目录合规性**：打包产物包含且仅依赖根目录 `index.html` 与 `assets/`，无 `komari-theme.json` 残留。
- [ ] **路由合规性**：首页 `/#/`、详情页 `/#/server/:id`、后台跳转 `/admin#/admin` 全部正常工作，刷新页面不 404。
- [ ] **D1 消耗合规性**：打开浏览器 Network 面板观察 5 分钟，除首次加载外，无任何针对 `/api/servers` 或 `/api/history/all` 的定时轮询请求，实时数据完全由 `/api/ws` 的 `batchUpdate` 驱动。
- [ ] **核心特性完整性**：
  - [ ] 流量进度条能正确解析 `"500GB"` / `"1TB"` 等配额并展示 HSL 渐变色。
  - [ ] 标签字段同时支持 `,` 和 `;` 分隔以及 `<color>` 颜色标记，且能正确受控展示价格与到期时间。
  - [ ] 详情页能正确展示三网延迟（`ct`/`cu`/`cm`/`bd`）及 `0.167h`（10 分钟）~ `7d` 历史趋势图。
  - [ ] 节点 ID 为 UUID 字符串时，路由跳转、流量条匹配、WebSocket 增量更新全部精确匹配。
- [ ] **CSP 与响应式**：移动端与桌面端布局自适应良好，深浅色切换正常，无外部未授权资源请求。
