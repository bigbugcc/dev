const tencentcloud = require("tencentcloud-sdk-nodejs-teo");
const TeoClient = tencentcloud.v20220901.Client;

const secretId = process.env.TENCENT_SECRET_ID;
const secretKey = process.env.TENCENT_SECRET_KEY;
const zoneId = process.env.TEO_ZONE_ID;
const domain = process.env.TEO_DOMAIN; // e.g., https://example.com

if (!secretId || !secretKey || !zoneId || !domain) {
  console.error("Missing required environment variables: TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TEO_ZONE_ID, TEO_DOMAIN");
  process.exit(1);
}

const clientConfig = {
  credential: {
    secretId: secretId,
    secretKey: secretKey,
  },
  region: "",
  profile: {
    httpProfile: {
      endpoint: "teo.tencentcloudapi.com",
    },
  },
};

const client = new TeoClient(clientConfig);

// Get changed files from command line arguments
// The arguments are expected to be a space-separated list of file paths
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("No files changed. Skipping CDN refresh.");
  process.exit(0);
}

// Filter out files that shouldn't trigger a cache refresh (e.g., .github, .gitignore, README.md)
// and map them to URLs
const urls = args
  .filter(file => {
    const normalizedFile = file.replace(/\\/g, '/');
    return !normalizedFile.includes('/.github/') && 
           !normalizedFile.startsWith('scripts/') && 
           !normalizedFile.includes('/scripts/') && 
           !normalizedFile.endsWith('package.json') && 
           !normalizedFile.endsWith('package-lock.json') &&
           !normalizedFile.endsWith('README.md');
  })
  .map(file => {
    // Ensure domain doesn't end with / and file doesn't start with / to avoid double slashes
    const baseUrl = domain.replace(/\/$/, "");
    const filePath = file.replace(/^\//, "");
    return `${baseUrl}/${filePath}`;
  });

if (urls.length === 0) {
  console.log("No relevant files changed. Skipping CDN refresh.");
  process.exit(0);
}

console.log("Refreshing CDN for the following URLs:", urls);

const params = {
  ZoneId: zoneId,
  Type: "purge_url", // purge_url for files, purge_prefix for directories
  Method: "invalidate", // invalidate or delete. invalidate is usually safer/better for refresh
  Targets: urls,
};

client.CreatePurgeTask(params).then(
  (data) => {
    console.log("CDN refresh task created successfully:", data);
  },
  (err) => {
    console.error("Error creating CDN refresh task:", err);
    process.exit(1);
  }
);
