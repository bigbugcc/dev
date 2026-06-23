# EdgeOne CDN GitHub Action 配置

[English (default)](./SECRETS.md) | 简体中文

工作流 [`.github/workflows/cdn-refresh.yml`](../.github/workflows/cdn-refresh.yml) 会清除腾讯云 EdgeOne 中发生变更的 Live2D 资源缓存，并在清除成功后预热当前仍存在的文件。

## 触发条件与处理方式

每次向 `main` 或 `master` 分支推送时都会启动工作流，也可以从 GitHub Actions 页面手动运行。对于 push，第一个轻量步骤会将仓库中的全部变更路径与根目录的 [`refresh-cdn.list`](../refresh-cdn.list) 对比。只有至少一个路径命中列表时，才继续安装依赖、运行测试并调用 EdgeOne API。

- 新增和修改的文件先清除缓存，再进行预热。
- 删除的文件只清除缓存，不进行预热。
- 文件重命名时，旧 URL 和新 URL 都会清除缓存，但只预热新 URL。
- URL 和目录清除分别使用独立配额。自动模式比较本次目标数占各自剩余日额度的比例，比例相同时优先 URL。
- 目录清除使用直接删除；先使用变更文件的直接父目录，只有额度不足时才逐级收敛到顶层安全目录。
- 首选清除方式失败后会重新查询配额，并用另一种方式完整重试一次；只有缓存清除无法成功时才终止工作流。
- 预热为最佳努力：没有额度或任何预热错误都会输出带 `⚠` 的警告，但不会让已经成功的清除流程失败。
- 所有部署任务串行执行，避免同时消耗同一份 EdgeOne 每日额度。
- 创建任务前查询 EdgeOne 实时配额，并等待每个刷新和预热任务执行完成。

## CDN 刷新白名单

`refresh-cdn.list` 使用 Git 的 `.gitignore` 匹配引擎，但普通模式表示白名单：变更文件必须命中某条模式，才会进入 CDN 后续流程。每行填写一个模式。

```gitignore
# 包含 live2d 下的全部文件。
/live2d/**

# 从已包含的目录树中排除一个文件。
!/live2d/README.md

# 包含一个仓库相对路径文件。
/assets/logo.png
```

支持与 `.gitignore` 相同的语法，包括注释（`#`）、取反（`!`）、根路径模式（`/path`）、目录模式、`*`、`?` 和 `**`。该列表是唯一的 CDN 路径过滤配置，GitHub workflow 不再配置 `paths`。

## 手动强制刷新

进入 **Actions → Refresh and prefetch EdgeOne CDN → Run workflow**，选择 `main` 或 `master`。手动运行会忽略提交差异，枚举所选提交中受 Git 管理的全部文件，并优先对 `TEO_DOMAIN/live2d/` 执行一次直接删除的目录清除。目录清除不可用或失败时，再降级为名单中全部文件的 URL 清除。

目录清除会使整个目录失效，包括 `!pattern` 排除的缓存项；排除规则仍严格控制 URL 清除和预热目标。手动运行继续受 `TEO_MAX_TARGETS_PER_RUN`、实时配额和预热模式限制，且可能产生较多回源及边缘流量。在其他分支上手动运行时任务会被跳过。

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
| `TEO_MAX_TARGETS_PER_RUN` | `1000` | 每种清除或预热操作的目标数安全上限。预热不可用时跳过；清除会先尝试另一种方式再失败。 |
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
| `CDN_BASE_SHA` | `github.event.before`，否则使用 `github.sha` | 本次推送提交范围的起点；手动强制刷新时忽略。 |
| `CDN_HEAD_SHA` | `github.sha` | 本次推送提交范围的终点。 |
| `CDN_FORCE_REFRESH` | `github.event_name == 'workflow_dispatch'` | 让手动运行先枚举全部受 Git 管理的路径，再应用 `refresh-cdn.list`。 |

分支首次推送时，GitHub 会提供全零的 base SHA；脚本会先将仓库中的全部当前文件视为新增，再仅保留 `refresh-cdn.list` 命中的路径。

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

- **没有可用的预热额度：** 工作流输出 `⚠ Prefetch skipped`，缓存清除成功后仍保持成功状态。
- **首选清除失败：** 工作流输出带 `⚠` 的警告、重新查询配额，并用 URL/目录的另一种方式完整重试一次。
- **工作流已运行但跳过 CDN 步骤：** 本次变更没有路径命中 `refresh-cdn.list`，请检查轻量匹配步骤的日志和列表模式。
- **目标数量超出限制：** 先检查检测到的文件；确认部署符合预期后，再有意识地提高 `TEO_MAX_TARGETS_PER_RUN`。
- **任务等待超时：** 提高 `TEO_WAIT_TIMEOUT_SECONDS` 前，先检查 EdgeOne 任务记录及源站可用性。
- **CDN URL 不正确：** 检查 `TEO_DOMAIN` 是否已经包含仓库的 `live2d` 路径。
- **CAM 未授权：** 为腾讯云凭证添加上面列出的 5 项 API 权限。

官方文档：[创建清除缓存任务](https://cloud.tencent.com/document/api/1552/80703)、[创建预热任务](https://cloud.tencent.com/document/api/1552/80704)、[查询内容管理接口配额](https://cloud.tencent.com/document/api/1552/80701)、[EdgeOne 套餐额度](https://cloud.tencent.com/document/product/1552/94165)。
