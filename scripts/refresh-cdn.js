"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ZERO_SHA = /^0+$/;
const REFRESH_LIST_PATH = path.resolve(__dirname, "..", "refresh-cdn.list");
const TERMINAL_FAILURE_STATUSES = new Set(["failed", "timeout", "canceled", "invalid"]);
const DEFAULTS = {
  batchSize: 500,
  maxTargetsPerRun: 1000,
  pollIntervalSeconds: 5,
  waitTimeoutSeconds: 600,
};
const TASK_QUERY_LIMIT = 1000;

function escapeWorkflowCommand(value) {
  return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function annotation(level, title, message) {
  const text = `[${level.toUpperCase()}] ${title}: ${message}`;
  console.log(text);
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(`::${level} title=${escapeWorkflowCommand(title)}::${escapeWorkflowCommand(message)}`);
  }
}

function group(title) {
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::group::${escapeWorkflowCommand(title)}`);
  else console.log(`\n=== ${title} ===`);
}

function endGroup() {
  if (process.env.GITHUB_ACTIONS === "true") console.log("::endgroup::");
}

function writeSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) fs.appendFileSync(outputPath, `${name}=${value}\n`, "utf8");
}

function positiveInteger(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received: ${raw}`);
  }
  return value;
}

function parseArguments(argv) {
  const options = { base: undefined, head: undefined, checkOnly: false, dryRun: false, forceList: false, files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check-only") options.checkOnly = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--force-list") options.forceList = true;
    else if (argument === "--base" || argument === "--head") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a git revision`);
      options[argument.slice(2)] = value;
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      // Backwards-compatible mode: positional arguments are treated as modified files.
      options.files.push(argument);
    }
  }
  return options;
}

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || "unknown error").trim()}`);
  }
  return result.stdout;
}

function parseNameStatus(output) {
  const tokens = output.split("\0").filter(Boolean);
  const changes = [];
  for (let index = 0; index < tokens.length; ) {
    let statusToken = tokens[index++];
    let inlinePath;
    if (statusToken.includes("\t")) {
      [statusToken, inlinePath] = statusToken.split(/\t/, 2);
    }
    const status = statusToken[0];
    if (!"ACDMRTUXB".includes(status)) throw new Error(`Unsupported git change status: ${statusToken}`);

    if (status === "R" || status === "C") {
      const oldPath = inlinePath || tokens[index++];
      const newPath = tokens[index++];
      if (!oldPath || !newPath) throw new Error(`Unable to parse ${statusToken} change from git output`);
      changes.push({ status, oldPath, path: newPath });
    } else {
      const path = inlinePath || tokens[index++];
      if (!path) throw new Error(`Unable to parse ${statusToken} change from git output`);
      changes.push({ status, path });
    }
  }
  return changes;
}

function collectChanges(options) {
  const head = options.head || process.env.CDN_HEAD_SHA || process.env.GITHUB_SHA || "HEAD";
  const forceList = options.forceList || process.env.CDN_FORCE_REFRESH === "true";
  if (forceList) {
    return runGit(["ls-tree", "-r", "--name-only", "-z", head])
      .split("\0")
      .filter(Boolean)
      .map((path) => ({ status: "A", path }));
  }
  if (options.files.length > 0) return options.files.map((path) => ({ status: "M", path }));

  const base = options.base || process.env.CDN_BASE_SHA || process.env.GITHUB_EVENT_BEFORE;
  let output;

  if (!base || ZERO_SHA.test(base)) {
    // A branch's first push has an all-zero before SHA. Treat the full tree as new,
    // even when the pushed HEAD itself has parents from another branch.
    output = runGit(["ls-tree", "-r", "--name-only", "-z", head])
      .split("\0")
      .filter(Boolean)
      .map((path) => `A\0${path}\0`)
      .join("");
  } else {
    output = runGit(["diff", "--name-status", "--find-renames", "-z", base, head]);
  }
  return parseNameStatus(output);
}

function normalizeAssetPath(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function matchRefreshList(paths, listPath = REFRESH_LIST_PATH) {
  if (!fs.existsSync(listPath)) throw new Error(`CDN refresh allowlist not found: ${listPath}`);
  const normalizedPaths = [...new Set(paths.map(normalizeAssetPath).filter(Boolean))];
  if (normalizedPaths.length === 0) return new Set();

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-cdn-"));
  try {
    fs.copyFileSync(listPath, path.join(temporaryDirectory, ".gitignore"));
    const emptyGlobalExclude = path.join(temporaryDirectory, "global-excludes");
    fs.writeFileSync(emptyGlobalExclude, "", "utf8");
    runGit(["init", "--quiet"], { cwd: temporaryDirectory });
    const result = spawnSync("git", [
      "-c", `core.excludesFile=${emptyGlobalExclude}`,
      "check-ignore", "--no-index", "-z", "--stdin",
    ], {
      cwd: temporaryDirectory,
      input: `${normalizedPaths.join("\0")}\0`,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`Unable to evaluate ${listPath}: ${(result.stderr || "unknown git error").trim()}`);
    }
    return new Set(result.stdout.split("\0").filter(Boolean).map(normalizeAssetPath));
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function filterChangesByRefreshList(changes, listPath = REFRESH_LIST_PATH) {
  const candidatePaths = changes.flatMap((change) => [change.oldPath, change.path]).filter(Boolean);
  const matchedPaths = matchRefreshList(candidatePaths, listPath);
  const selected = [];

  for (const change of changes) {
    const currentPath = normalizeAssetPath(change.path);
    const oldPath = change.oldPath && normalizeAssetPath(change.oldPath);
    const currentMatches = matchedPaths.has(currentPath);
    const oldMatches = oldPath && matchedPaths.has(oldPath);

    if (change.status === "R") {
      if (oldMatches && currentMatches) selected.push({ ...change, oldPath, path: currentPath });
      else if (oldMatches) selected.push({ status: "D", path: oldPath });
      else if (currentMatches) selected.push({ status: "A", path: currentPath });
    } else if (change.status === "C") {
      if (currentMatches) selected.push({ status: "A", path: currentPath });
    } else if (currentMatches) {
      selected.push({ ...change, path: currentPath });
    }
  }
  return selected;
}

function encodePath(path) {
  return normalizeAssetPath(path).split("/").map((part) => encodeURIComponent(part)).join("/");
}

function createUrlMapper(domain) {
  let base;
  try {
    base = new URL(domain);
  } catch {
    throw new Error(`TEO_DOMAIN must be an absolute http(s) URL, received: ${domain}`);
  }
  if (!/^https?:$/.test(base.protocol) || base.search || base.hash) {
    throw new Error("TEO_DOMAIN must use http(s) and must not contain a query string or fragment");
  }
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return (path) => new URL(encodePath(path), base).href;
}

function buildTargets(changes, domain) {
  const toUrl = createUrlMapper(domain);
  const purgePaths = new Set();
  const prefetchPaths = new Set();

  for (const change of changes) {
    const path = normalizeAssetPath(change.path);
    const oldPath = change.oldPath && normalizeAssetPath(change.oldPath);

    if (oldPath) purgePaths.add(oldPath);
    purgePaths.add(path);
    if (change.status !== "D") prefetchPaths.add(path);
  }

  return {
    purgeUrls: [...purgePaths].sort().map(toUrl),
    prefetchUrls: [...prefetchPaths].sort().map(toUrl),
  };
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createRateLimitedCaller(client, minimumIntervalMs = 75) {
  let lastCallAt = 0;
  return async (method, params) => {
    const wait = Math.max(0, minimumIntervalMs - (Date.now() - lastCallAt));
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return client[method](params);
  };
}

function quotaFor(quotas, type) {
  return (quotas || []).find((quota) => quota.Type === type);
}

function assertCapacity(label, targetCount, quota, maxTargetsPerRun) {
  if (targetCount === 0) return;
  if (targetCount > maxTargetsPerRun) {
    throw new Error(`${label} requires ${targetCount} targets, exceeding TEO_MAX_TARGETS_PER_RUN=${maxTargetsPerRun}`);
  }
  if (!quota || !Number.isFinite(quota.Batch) || quota.Batch <= 0) {
    throw new Error(`The current EdgeOne plan has no available ${label} quota`);
  }
  if (!Number.isFinite(quota.DailyAvailable) || quota.DailyAvailable < targetCount) {
    throw new Error(`${label} requires ${targetCount} targets, but only ${quota.DailyAvailable ?? 0} daily quota remains`);
  }
}

function formatFailedList(items) {
  return (items || []).map((item) => `${item.Target || "unknown target"}: ${item.Message || item.FailMessage || item.Reason || "unknown reason"}`).join("; ");
}

async function createTasks({ label, urls, batchSize, createMethod, createParams, call }) {
  const jobs = [];
  const batches = chunks(urls, batchSize);
  for (let index = 0; index < batches.length; index += 1) {
    const targets = batches[index];
    console.log(`[${label}] Submitting batch ${index + 1}/${batches.length} (${targets.length} URLs)`);
    // Do not automatically retry a mutating call: an ambiguous retry could consume quota twice.
    const response = await call(createMethod, { ...createParams, Targets: targets });
    if (response.FailedList?.length) {
      throw new Error(`${label} batch ${index + 1} was partially rejected: ${formatFailedList(response.FailedList)}`);
    }
    if (!response.JobId) throw new Error(`${label} batch ${index + 1} did not return a JobId`);
    console.log(`[${label}] Accepted: job=${response.JobId}, request=${response.RequestId || "n/a"}`);
    jobs.push({ id: response.JobId, expectedTargets: targets.length });
  }
  return jobs;
}

async function waitForJob({ label, job, describeMethod, zoneId, call, pollIntervalMs, timeoutMs }) {
  const startedAt = Date.now();
  let lastProgress = "";

  while (Date.now() - startedAt < timeoutMs) {
    const response = await call(describeMethod, {
      ZoneId: zoneId,
      Limit: TASK_QUERY_LIMIT,
      Filters: [{ Name: "job-id", Values: [job.id] }],
    });
    const tasks = response.Tasks || [];
    const counts = tasks.reduce((result, task) => {
      const status = String(task.Status || "unknown").toLowerCase();
      result[status] = (result[status] || 0) + 1;
      return result;
    }, {});
    const progress = Object.entries(counts).map(([status, count]) => `${status}=${count}`).join(", ") || "waiting for records";
    if (progress !== lastProgress) {
      console.log(`[${label}] job=${job.id}: ${progress}`);
      lastProgress = progress;
    }

    const failures = tasks.filter((task) => TERMINAL_FAILURE_STATUSES.has(String(task.Status).toLowerCase()));
    if (failures.length > 0) {
      throw new Error(`${label} job ${job.id} failed: ${formatFailedList(failures)}`);
    }

    const allSucceeded = tasks.length >= job.expectedTargets && tasks.every((task) => task.Status === "success");
    if (allSucceeded) return;
    await sleep(pollIntervalMs);
  }
  throw new Error(`${label} job ${job.id} did not finish within ${Math.round(timeoutMs / 1000)} seconds`);
}

async function waitForJobs(options, jobs) {
  for (const job of jobs) await waitForJob({ ...options, job });
}

function printUrlPlan(label, urls) {
  console.log(`${label}: ${urls.length}`);
  for (const url of urls) console.log(`  - ${url}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  group("Match changed files against refresh-cdn.list");
  const allChanges = collectChanges(options);
  const changes = filterChangesByRefreshList(allChanges);
  const forceList = options.forceList || process.env.CDN_FORCE_REFRESH === "true";
  console.log(`Mode: ${forceList ? "manual force refresh" : "changed files only"}`);
  for (const change of allChanges) {
    console.log(`${change.status}\t${change.oldPath ? `${change.oldPath} -> ` : ""}${change.path}`);
  }
  console.log(`Matched changes: ${changes.length}/${allChanges.length}`);
  setOutput("refresh_required", changes.length > 0 ? "true" : "false");
  endGroup();

  if (changes.length === 0) {
    annotation("notice", "CDN skipped", "No changed files matched refresh-cdn.list");
    writeSummary(["## EdgeOne CDN", "", "No changed files matched `refresh-cdn.list`; CDN work was skipped."]);
    return;
  }

  if (options.checkOnly) {
    annotation("notice", forceList ? "Forced CDN refresh ready" : "CDN changes detected", `${changes.length} entries matched refresh-cdn.list`);
    return;
  }

  const domain = process.env.TEO_DOMAIN;
  if (!domain) throw new Error("Missing required environment variable: TEO_DOMAIN");

  group("Build CDN URL plan");
  const { purgeUrls, prefetchUrls } = buildTargets(changes, domain);
  printUrlPlan("Purge targets", purgeUrls);
  printUrlPlan("Prefetch targets", prefetchUrls);
  endGroup();

  if (options.dryRun || process.env.TEO_DRY_RUN === "true") {
    annotation("notice", "CDN dry run", `Would purge ${purgeUrls.length} URLs and prefetch ${prefetchUrls.length} URLs`);
    return;
  }

  const required = ["TENCENT_SECRET_ID", "TENCENT_SECRET_KEY", "TEO_ZONE_ID"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

  const maxTargetsPerRun = positiveInteger("TEO_MAX_TARGETS_PER_RUN", DEFAULTS.maxTargetsPerRun);
  const configuredBatchSize = positiveInteger("TEO_BATCH_SIZE", DEFAULTS.batchSize);
  const pollIntervalMs = positiveInteger("TEO_POLL_INTERVAL_SECONDS", DEFAULTS.pollIntervalSeconds) * 1000;
  const timeoutMs = positiveInteger("TEO_WAIT_TIMEOUT_SECONDS", DEFAULTS.waitTimeoutSeconds) * 1000;
  const zoneId = process.env.TEO_ZONE_ID;
  const prefetchMode = process.env.TEO_PREFETCH_MODE || "default";
  if (!new Set(["default", "edge"]).has(prefetchMode)) throw new Error("TEO_PREFETCH_MODE must be default or edge");

  // Loaded only for real API calls, so local --dry-run works without installing dependencies.
  const tencentcloud = require("tencentcloud-sdk-nodejs-teo");
  const TeoClient = tencentcloud.v20220901.Client;
  const client = new TeoClient({
    credential: {
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    },
    region: "",
    profile: { httpProfile: { endpoint: "teo.tencentcloudapi.com" } },
  });
  const call = createRateLimitedCaller(client);

  group("Check EdgeOne content-management quota");
  const quotaResponse = await call("DescribeContentQuota", { ZoneId: zoneId });
  const purgeQuota = quotaFor(quotaResponse.PurgeQuota, "purge_url");
  const prefetchQuota = quotaFor(quotaResponse.PrefetchQuota, "prefetch_url");
  console.log(`Purge quota: batch=${purgeQuota?.Batch ?? 0}, daily remaining=${purgeQuota?.DailyAvailable ?? 0}/${purgeQuota?.Daily ?? 0}`);
  console.log(`Prefetch quota: batch=${prefetchQuota?.Batch ?? 0}, daily remaining=${prefetchQuota?.DailyAvailable ?? 0}/${prefetchQuota?.Daily ?? 0}`);
  assertCapacity("purge", purgeUrls.length, purgeQuota, maxTargetsPerRun);
  assertCapacity("prefetch", prefetchUrls.length, prefetchQuota, maxTargetsPerRun);
  endGroup();

  group("Purge changed EdgeOne URLs");
  const purgeJobs = await createTasks({
    label: "purge",
    urls: purgeUrls,
    batchSize: Math.min(configuredBatchSize, purgeQuota.Batch, TASK_QUERY_LIMIT),
    createMethod: "CreatePurgeTask",
    createParams: { ZoneId: zoneId, Type: "purge_url" },
    call,
  });
  await waitForJobs({
    label: "purge",
    describeMethod: "DescribePurgeTasks",
    zoneId,
    call,
    pollIntervalMs,
    timeoutMs,
  }, purgeJobs);
  endGroup();

  let prefetchJobs = [];
  if (prefetchUrls.length > 0) {
    group("Prefetch changed EdgeOne URLs");
    prefetchJobs = await createTasks({
      label: "prefetch",
      urls: prefetchUrls,
      batchSize: Math.min(configuredBatchSize, prefetchQuota.Batch, TASK_QUERY_LIMIT),
      createMethod: "CreatePrefetchTask",
      createParams: { ZoneId: zoneId, Mode: prefetchMode },
      call,
    });
    await waitForJobs({
      label: "prefetch",
      describeMethod: "DescribePrefetchTasks",
      zoneId,
      call,
      pollIntervalMs,
      timeoutMs,
    }, prefetchJobs);
    endGroup();
  }

  annotation("notice", "EdgeOne CDN ready", `Purged ${purgeUrls.length} URLs and prefetched ${prefetchUrls.length} URLs`);
  writeSummary([
    "## EdgeOne CDN",
    "",
    "| Operation | URLs | Jobs | Result |",
    "| --- | ---: | ---: | --- |",
    `| Purge | ${purgeUrls.length} | ${purgeJobs.length} | Success |`,
    `| Prefetch | ${prefetchUrls.length} | ${prefetchJobs.length} | ${prefetchUrls.length ? "Success" : "Skipped (deleted files only)"} |`,
    "",
    `Prefetch mode: \`${prefetchMode}\``,
  ]);
}

if (require.main === module) {
  main().catch((error) => {
    annotation("error", "EdgeOne CDN failed", error.message || String(error));
    writeSummary(["## EdgeOne CDN", "", `❌ ${error.message || String(error)}`]);
    process.exitCode = 1;
  });
}

module.exports = { buildTargets, collectChanges, filterChangesByRefreshList, matchRefreshList, parseNameStatus };
