# EdgeOne CDN GitHub Action 配置

[English (default)](./SECRETS.md) | 简体中文

工作流 [`.github/workflows/cdn-refresh.yml`](../.github/workflows/cdn-refresh.yml) 会清除腾讯云 EdgeOne 中发生变更的 Live2D 资源缓存，并在清除成功后预热当前仍存在的文件。

## 触发条件与处理方式

当 `live2d/**` 的变更推送至 `main` 或 `master` 分支时触发，但忽略 `live2d/README.md`。

- 新增和修改的文件先清除缓存，再进行预热。
- 删除的文件只清除缓存，不进行预热。
- 文件重命名时，旧 URL 和新 URL 都会清除缓存，但只预热新 URL。
- 所有部署任务串行执行，避免同时消耗同一份 EdgeOne 每日额度。
- 创建任务前查询 EdgeOne 实时配额，并等待每个刷新和预热任务执行完成。

## 必需的仓库 Secrets

进入 **仓库 → Settings → Secrets and variables → Actions → Secrets → New repository secret**，添加：

| Secret | 说明 | 示例 |
| --- | --- | --- |
| `TENCENT_SECRET_ID` | 腾讯云 API SecretId。 | `AKIDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TENCENT_SECRET_KEY` | 腾讯云 API SecretKey。 | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TEO_ZONE_ID` | EdgeOne 站点 ID（`ZoneId`）。 | `zone-xxxxxxxxxxxx` |
| `TEO_DOMAIN` | 用于拼接仓库文件路径的 CDN 公网基础 URL，必须包含 `http://` 或 `https://`。 | `https://cdn.example.com` |

`TEO_DOMAIN` 应为仓库路径之前的根地址。例如资源实际地址为：

```text
https://cdn.example.com/live2d/live2d-core.js
```

则应将 `TEO_DOMAIN` 设置为 `https://cdn.example.com`，而不是 `https://cdn.example.com/live2d`。如果仓库发布在子路径下，例如 `https://cdn.example.com/project/live2d/...`，则填写 `https://cdn.example.com/project`。

SecretId 和 SecretKey 可在[腾讯云 API 密钥管理](https://console.cloud.tencent.com/cam/capi)中创建；站点 ID 可在 [EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)中查看。

## 可选的仓库 Variables

进入 **仓库 → Settings → Secrets and variables → Actions → Variables → New repository variable**。以下变量均为可选：

| Variable | 默认值 | 说明 |
| --- | ---: | --- |
| `TEO_BATCH_SIZE` | `500` | 每个 API 任务提交的 URL 数量。实际值还会受 EdgeOne 实时单批配额及 1,000 条任务查询上限约束。 |
| `TEO_MAX_TARGETS_PER_RUN` | `1000` | 单次工作流中刷新或预热目标数的安全上限。超出时会在消耗额度前失败。 |
| `TEO_POLL_INTERVAL_SECONDS` | `5` | 查询任务状态的时间间隔。 |
| `TEO_WAIT_TIMEOUT_SECONDS` | `600` | 等待每个 EdgeOne 任务完成的最长时间。 |
| `TEO_PREFETCH_MODE` | `default` | `default` 预热至中间层；`edge` 预热至边缘层和中间层。 |

除非腾讯云已为当前账号开通 `edge` 白名单功能，否则请保持 `TEO_PREFETCH_MODE=default`。边缘预热产生的流量会计费，并使用单独的预热额度。

脚本还会将 API 请求速率控制在官方规定的每秒 20 次以下，请勿激进地缩短轮询间隔。

## 腾讯云 CAM 权限

API 凭证必须能够对指定站点调用以下 EdgeOne 接口：

```text
teo:DescribeContentQuota
teo:CreatePurgeTask
teo:DescribePurgeTasks
teo:CreatePrefetchTask
teo:DescribePrefetchTasks
```

建议使用专用子账号或角色，并将权限限制到所需的 EdgeOne 站点。不要将 API 密钥提交到仓库，也不要在工作流日志中输出密钥。

## 工作流自动提供的值

以下值来自 GitHub push 事件，无需配置为仓库参数：

| 名称 | 来源 | 用途 |
| --- | --- | --- |
| `CDN_BASE_SHA` | `github.event.before` | 本次推送提交范围的起点。 |
| `CDN_HEAD_SHA` | `github.sha` | 本次推送提交范围的终点。 |

分支首次推送时，GitHub 会提供全零的 base SHA；脚本会将当前所有 `live2d/**` 文件视为新部署资源。

## 本地试运行

试运行只输出检测到的 URL，不需要安装腾讯云 SDK，也不会调用 EdgeOne：

```powershell
$env:TEO_DOMAIN = "https://cdn.example.com"
node scripts/refresh-cdn.js --base HEAD~1 --head HEAD --dry-run
```

也可以直接传入文件路径快速检查：

```powershell
$env:TEO_DOMAIN = "https://cdn.example.com"
node scripts/refresh-cdn.js --dry-run "live2d/live2d-core.js"
```

## 常见问题

- **没有可用的预热额度：** 当前 EdgeOne 套餐可能不支持 URL 预热，或当日额度已经用完。
- **目标数量超出限制：** 先检查检测到的文件；确认部署符合预期后，再有意识地提高 `TEO_MAX_TARGETS_PER_RUN`。
- **任务等待超时：** 提高 `TEO_WAIT_TIMEOUT_SECONDS` 前，先检查 EdgeOne 任务记录及源站可用性。
- **CDN URL 不正确：** 检查 `TEO_DOMAIN` 是否已经包含仓库的 `live2d` 路径。
- **CAM 未授权：** 为腾讯云凭证添加上面列出的 5 项 API 权限。

官方文档：[创建清除缓存任务](https://cloud.tencent.com/document/api/1552/80703)、[创建预热任务](https://cloud.tencent.com/document/api/1552/80704)、[查询内容管理接口配额](https://cloud.tencent.com/document/api/1552/80701)、[EdgeOne 套餐额度](https://cloud.tencent.com/document/product/1552/94165)。
