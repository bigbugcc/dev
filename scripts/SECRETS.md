# EdgeOne CDN GitHub Action configuration

English (default) | [简体中文](./SECRETS.zh-CN.md)

The workflow in [`.github/workflows/cdn-refresh.yml`](../.github/workflows/cdn-refresh.yml) purges changed Live2D assets from Tencent Cloud EdgeOne and then prefetches the current files after the purge succeeds.

## Trigger and behavior

The workflow runs when `live2d/**` changes are pushed to `main` or `master`, except for `live2d/README.md`.

- Added and modified files are purged, then prefetched.
- Deleted files are purged but not prefetched.
- For renamed files, the old and new URLs are purged; only the new URL is prefetched.
- Jobs are serialized to avoid competing for the same EdgeOne daily quota.
- The workflow checks the live EdgeOne quota before creating tasks and waits for every purge and prefetch task to finish.

## Required repository secrets

Open **Repository → Settings → Secrets and variables → Actions → Secrets → New repository secret** and add:

| Secret | Description | Example |
| --- | --- | --- |
| `TENCENT_SECRET_ID` | Tencent Cloud API SecretId. | `AKIDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TENCENT_SECRET_KEY` | Tencent Cloud API SecretKey. | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TEO_ZONE_ID` | EdgeOne site ID (`ZoneId`). | `zone-xxxxxxxxxxxx` |
| `TEO_DOMAIN` | Public CDN base URL to which repository paths are appended. Must include `http://` or `https://`. | `https://cdn.example.com` |

`TEO_DOMAIN` is the root before the repository path. For example, if the deployed asset is:

```text
https://cdn.example.com/live2d/live2d-core.js
```

set `TEO_DOMAIN` to `https://cdn.example.com`, not `https://cdn.example.com/live2d`. If the repository is published below a prefix, such as `https://cdn.example.com/project/live2d/...`, use `https://cdn.example.com/project`.

SecretId and SecretKey can be created in [Tencent Cloud API key management](https://console.cloud.tencent.com/cam/capi). The site ID is available in the [EdgeOne console](https://console.cloud.tencent.com/edgeone).

## Optional repository variables

Open **Repository → Settings → Secrets and variables → Actions → Variables → New repository variable**. All variables are optional:

| Variable | Default | Description |
| --- | ---: | --- |
| `TEO_BATCH_SIZE` | `500` | Requested URLs per API task. The effective value is also capped by the live EdgeOne batch quota and the task-query limit of 1,000. |
| `TEO_MAX_TARGETS_PER_RUN` | `1000` | Safety limit for purge or prefetch targets in one workflow run. The run fails before consuming quota when exceeded. |
| `TEO_POLL_INTERVAL_SECONDS` | `5` | Interval between task-status queries. |
| `TEO_WAIT_TIMEOUT_SECONDS` | `600` | Maximum wait time for each EdgeOne task. |
| `TEO_PREFETCH_MODE` | `default` | `default` prefetches to the intermediate layer. `edge` prefetches to edge and intermediate layers. |

Keep `TEO_PREFETCH_MODE=default` unless Tencent Cloud has enabled the `edge` allowlist feature for the account. Edge prefetch traffic is billable and uses a separate quota.

The script also spaces API requests below the documented 20 requests/second limit. Do not raise polling frequency aggressively.

## Tencent Cloud CAM permissions

The API credential must be allowed to call these EdgeOne actions for the configured site:

```text
teo:DescribeContentQuota
teo:CreatePurgeTask
teo:DescribePurgeTasks
teo:CreatePrefetchTask
teo:DescribePrefetchTasks
```

Use a dedicated sub-account or role with access limited to the required EdgeOne site. Never commit API credentials to the repository or print them in workflow logs.

## Automatic workflow values

The workflow supplies these values from the GitHub push event; they are not repository settings:

| Name | Source | Purpose |
| --- | --- | --- |
| `CDN_BASE_SHA` | `github.event.before` | Start of the pushed commit range. |
| `CDN_HEAD_SHA` | `github.sha` | End of the pushed commit range. |

For the first push of a branch, GitHub provides an all-zero base SHA. The script then treats every current `live2d/**` file as newly deployed.

## Local dry run

A dry run prints the detected URLs without installing the Tencent Cloud SDK or calling EdgeOne:

```powershell
$env:TEO_DOMAIN = "https://cdn.example.com"
node scripts/refresh-cdn.js --base HEAD~1 --head HEAD --dry-run
```

You can also pass file paths directly for a quick check:

```powershell
$env:TEO_DOMAIN = "https://cdn.example.com"
node scripts/refresh-cdn.js --dry-run "live2d/live2d-core.js"
```

## Troubleshooting

- **No available prefetch quota:** the current EdgeOne plan may not include URL prefetch, or its daily quota is exhausted.
- **Target limit exceeded:** review the detected files, then deliberately raise `TEO_MAX_TARGETS_PER_RUN` if the deployment is expected.
- **Task timeout:** check the EdgeOne task history and origin availability before raising `TEO_WAIT_TIMEOUT_SECONDS`.
- **Incorrect CDN URL:** verify that `TEO_DOMAIN` does not already contain the repository's `live2d` path.
- **CAM unauthorized:** add the five API permissions listed above to the Tencent Cloud credential.

Official references: [create purge task](https://cloud.tencent.com/document/api/1552/80703), [create prefetch task](https://cloud.tencent.com/document/api/1552/80704), [query content quota](https://cloud.tencent.com/document/api/1552/80701), and [EdgeOne plan quotas](https://cloud.tencent.com/document/product/1552/94165).
