# 当前实现审查报告

审查日期：2026-11-16。

依据为本项目 `IMPLEMENTATION_PLAN.md`、[CFSM 主题开发约束](https://github.com/huilang-me/CF-Server-Monitor/blob/main/theme-ai-prompt.md)、[主题 API 文档](https://github.com/huilang-me/CF-Server-Monitor/blob/main/theme-develop.md)及 [BITJEBE 原型](https://github.com/BITJEBE/nezha-BITJEBE)。另核对了 CFSM 当前 `src/handlers/dashboard.js`、`src/index.js`、`src/middleware/auth.js` 的相关实现。原型仓库读取时 main 为 `88a9a07d5f60441b01440062474d0cc5339bc08a`，CFSM 为 `1be24f0eabdcc2d06c215c45258382b02e438b49`。

结论：构建和 lint 通过，核心迁移方向成立，但仍有 9 项可定位的功能问题。以下建议均针对已有调用链和字段映射，不需要增加通用容错框架或 REST 兜底轮询。

## 1. [P1] 首页首次载入重复查询服务器列表

- 位置：`src/context/cfsm-provider.tsx:420`、`:440`；调用方 `src/pages/Server.tsx:51`。
- 原因：`mountDashboard()` 和 Provider 的初始化 effect 都调用 `loadDashboardServers()`；`dashboardFetchedRef` 仅在请求完成后置为 true，请求进行中没有合并。
- 复现：生产构建页面首次打开、服务器响应延迟 150ms 时，记录到一次 `/api/config`、两次 `/api/servers`，并先后创建两条首页 WS。
- 影响：每次访问额外查询一次列表及其三网窗口，并重复建立连接，违反首页列表仅初始化一次的约束。
- 最小修正：保留一个初始化入口，或者在已有加载函数中复用进行中的 Promise。不要另加重试或定时查询。

## 2. [P1] 无新样本时在线状态不会随时间过期

- 位置：`src/context/cfsm-provider.tsx:412`；详情同类问题在 `src/hooks/use-server-detail.ts:196`。
- 原因：只有 `dirtyRef.current` 为 true 时才更新用于在线判定的 `now`。WS 保持连接但所有探针停止上报，或者 WS 无法恢复后，没有样本能推进该时间。
- 复现：列表返回一台在线节点，保持无 WS 样本，将浏览器时钟推进 301 秒，页面仍显示在线 1、离线 0 和原有网速。
- 影响：监控对象全部中断时，页面可能长期显示正常。
- 最小修正：已有本地计时器同时推进在线判定时间，或在节点五分钟期限到达时更新状态；隐藏页保留静态数据。无需任何额外 REST。

## 3. [P1] 多后端共用验证状态，部分站点无法正常访问

- 位置：`src/api/cfsm-client.ts:339`、`:375`、`:383`；`src/lib/turnstile.ts:3`；`src/context/cfsm-provider.tsx:219`。
- 原因：所有后端共用一个 `turnstile_verified` 存储值，只选择第一个开启验证的站点进行验证，验证后又用这一个站点的配置替换整个聚合配置。不同 Worker 签发的验证凭证通常不能互用。
- 复现：A/B 两个模拟 Worker 采用不同验证凭证；已有 A 凭证时，对 B 的 `/api/config`、`/api/servers` 仍携带 A 凭证。完成验证只请求 A，B 持续 403，最终列表仅有 A 的数据。
- 相关确定问题：`authorization: privateSites.every(...)` 在全部后端均公开时对空数组返回 true。两个后端均返回 `authorization:false`，聚合结果却是 true，设置弹窗会误显示管理员保存能力。`sysConfig` 也由最后一个成功后端覆盖，不能表达各站独立的开关。
- 最小修正：按 apiBase 保留每站的配置和验证凭证；逐站验证未通过的站点，验证后只更新对应站点。管理员保存权限应取保存目标的 `authorization`，节点显示开关也应来自所属站点。

## 4. [P2] CSP 白名单被误当成额外监控后端

- 位置：`vite.config.ts:65`、`:81`。
- 原因：代码合并 `API_BASE` 和 `CSP_API`，随后把二者一起写入 `<meta name="apiBase">`。`CSP_API` 的职责是追加 connect-src 白名单，不是增加监控站点。
- 复现：设置 `API_BASE=https://worker.example.com`、`CSP_API=https://extra-api.example.com`，插件实际输出 `apiBase="https://worker.example.com,https://extra-api.example.com"`。
- 影响：程序向额外白名单域名请求 `/api/config` 和 `/api/servers`，还可能携带现有请求凭证；同时没有正确生成所承诺的 CSP 配置，`CSP_STATIC` 读取后未使用。
- 最小修正：仅从 `API_BASE` 生成后端列表，分别实现 CSP 配置的输出。

## 5. [P2] 公开站长历史权限限制触发整页私密锁屏

- 位置：`src/api/cfsm-client.ts:223`、`src/context/cfsm-provider.tsx:205`；局部处理在 `src/hooks/use-server-detail.ts:109`。
- 原因：所有 401 都先通知全局 `unauthorized` 并设置 `privateRequired=true`，详情 hook 随后设置 `historyAuthRequired` 已经无法保住页面。
- 上游实际语义：当前 CFSM 对未登录用户的 `hours > 24` 历史请求返回 401，公开站的当前状态和短历史仍然允许访问，见 [历史请求实现](https://github.com/huilang-me/CF-Server-Monitor/blob/main/src/index.js)。
- 复现：公开站详情从 10m 切到 2d，历史返回 401，整页变为“该监控站点已开启私密模式”；同源模式还会跳往后台。
- 最小修正：此类预期的历史权限错误由详情处理，保留当前状态和短历史，并显示已有登录提示。通用请求函数已有 `notifyOnAuthError` 选项，可直接利用。

## 6. [P2] 时间范围快速切换会被旧响应覆盖

- 位置：`src/hooks/use-server-detail.ts:106`、`:108`、`:126`。
- 原因：每个历史响应都直接 `setHistory(sorted)`，不检查它是否仍对应当前节点和时间范围。
- 复现：先点 6h，随后点 1h，让 6h 响应延迟 700ms、1h 响应延迟 50ms；1h 按钮保持选中，但传入图表的历史数据最后来自 6h 响应。
- 影响：时间范围、采样密度和实际数据不一致；跨节点切换也存在同类旧响应写回风险。
- 最小修正：用请求序号或当前查询键检查响应，仅应用最新查询结果。无需为此引入新的请求管理库。

## 7. [P2] 累计流量统计丢弃了离线节点

- 位置：`src/pages/Server.tsx:180`、`:183`、`:187`。
- 原因：首页没有使用已保存的后端全局 stats，并且累计上传/下载求和也套用了在线过滤。CFSM 聚合累计流量包含全部可见节点，只有实时网速按在线状态过滤。
- 复现：一台离线节点上传 2048B、下载 1024B，REST stats 正确返回该值，首页却显示上传 0B、下载 0B。
- 影响：节点离线会让累计流量下降，展示口径与后端不一致。
- 最小修正：All 视图使用后端全局 stats；需要分组统计时，累计流量包含组内离线节点，网速继续仅计在线节点。实时增量按相同口径更新。

## 8. [P2] 详情页流量重置日读取了转换前的字段

- 位置：`src/components/ServerDetailOverview.tsx:91`；`src/lib/cfsm-normalizer.ts:341`、`:534`。
- 原因：normalizer 已将 CFSM 的 `reset_day` 转成 `traffic_reset_day`，详情组件却将转换后的 NezhaServer 再传给只读取 `reset_day` 的函数。
- 复现：原始 `reset_day=15`，转换结果 `traffic_reset_day=15`，详情再次解析却得到 0；浏览器流量条轮换到重置文案后显示“流量重置: N/A”。
- 最小修正：详情直接使用已解析的 `traffic_reset_day`，避免重复跨模型解析。

## 9. [P2] 免费价格 0 被当成未配置

- 位置：`src/lib/cfsm-normalizer.ts:424`、`:428`；`src/components/billingInfo.tsx:15`。
- 原因：只有 -1 转成免费的内部标记，0 留下空 amount。CFSM 文档明确约定 0、-1 均表示免费，空白才表示未设置。
- 复现：`price="0"`、`show_price=true`、无到期日时，`buildPublicNoteFromCfsm()` 得到 `billingDataMod:null`，不显示免费标签；-1 则显示。
- 最小修正：将数值 0 与 -1 都映射到已有免费标记，不要增加另一套标签格式。

## 方案文档需要同步的约定

1. `IMPLEMENTATION_PLAN.md:44` 允许断线后每 30 秒兜底 REST，与上游禁止轮询冲突，应删除该例外。当前代码未实现这种轮询，不应在修复时补上。
2. 文档多处指定默认 `hours=24`；上游主题约束要求默认 `0.167`。当前实现的 10m 默认值正确，应修改方案而不是改回代码。
3. `config.site_name` 应改为 `site_title`；到期字段以当前 API 的 `expire_date` 为准。当前代码已兼容这些实际字段。
4. 月度配额进度使用 `net_rx_monthly` / `net_tx_monthly`；不能将开机累计 `net_rx` / `net_tx` 当作月度计数。容量数值按明确的 API 单位解析，内存/磁盘数值单位为 MB，不需要猜测数值是否为 Bytes。
5. 方案要求把国旗和 OS 图标打进 assets，而上游当前规范要求复用 `/flags/`、`/os-icons/`。当前实现按 Worker 静态目录取资源的方向正确。
6. 保留 React 迁移底座与现有视觉组件是方案已明确的选择，无需因上游示例使用 Vue 而重写技术栈。管理员主题配置通过 `/api/theme_options` 保存、访客使用临时预览即可，无需扩展管理后台。

## 验证范围

- 执行 `npm.cmd run build` 和 `npm.cmd run lint`，均通过；产物根目录为 `index.html` 与 `assets/`。
- 使用生产构建页面和无头 Edge，拦截 REST/WS，以受控响应复现首屏重复查询、五分钟在线过期、公开站历史 401、多站验证、历史响应乱序、离线累计流量和重置日显示。
- 直接执行配置插件与 normalizer，核对 CSP_API 注入、免费价格和重置日转换。
- 核对了 Hash 路由、单机 WS 订阅、增量合并、首页每秒批量刷新、页面隐藏关闭 WS、三态探测值及主题服务端保存路径；未发现正常情况下的 REST 定时轮询。
- 本轮未连接真实 Worker，也未使用真实 JWT 或 Turnstile 服务。模拟验证不等同于公开/私有 × Turnstile 开/关的真实四组合验收，也不证明与原型的逐像素一致性。
- 未修改业务源码和方案文档；构建命令重新生成了 `dist/`、`theme/`，本报告为新增文档。当前目录没有 `.git`，无法提供提交差异。
