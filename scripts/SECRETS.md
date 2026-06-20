# GitHub Action Secrets 配置说明

为了使自动刷新 CDN 缓存的 GitHub Action 正常工作，您需要在 GitHub 仓库中配置以下 Repository Secrets。

请前往仓库的 **Settings** > **Secrets and variables** > **Actions** > **New repository secret** 进行添加。

## 必需的 Secrets

| Secret 名称 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `TENCENT_SECRET_ID` | 腾讯云 API 密钥 ID | `AKIDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TENCENT_SECRET_KEY` | 腾讯云 API 密钥 Key | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TEO_ZONE_ID` | 腾讯云 EdgeOne 站点 ID (ZoneId) | `zone-xxxxxxxxxxxx` |
| `TEO_DOMAIN` | 您的加速域名 (用于拼接刷新 URL) | `https://example.com` |

## 获取方式

1.  **TENCENT_SECRET_ID / KEY**: 访问 [腾讯云访问管理 - API 密钥管理](https://console.cloud.tencent.com/cam/capi) 获取。
2.  **TEO_ZONE_ID**: 访问 [腾讯云 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)，进入您的站点概览页，在基础信息中查看 "站点 ID"。
3.  **TEO_DOMAIN**: 您在 EdgeOne 中绑定的加速域名。

## 注意事项

*   请确保 `TEO_DOMAIN` 包含协议头（如 `https://`）。
*   脚本会自动处理域名末尾的斜杠，因此 `https://example.com` 和 `https://example.com/` 均可。
