"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assessQuota,
  buildTargets,
  buildPurgeCandidates,
  collapsePrefixPathsToLimit,
  collectChanges,
  filterChangesByRefreshList,
  orderPurgeCandidates,
  parseNameStatus,
  resolveTeoClient,
  runBestEffortPrefetch,
  runPurgeWithFallback,
} = require("./refresh-cdn");

test("resolves the Client from the standalone TEO SDK export", () => {
  class FakeTeoClient {}
  assert.equal(resolveTeoClient({ teo: { v20220901: { Client: FakeTeoClient } } }), FakeTeoClient);
  assert.throws(
    () => resolveTeoClient({ v20220901: { Client: FakeTeoClient } }),
    /expected teo\.v20220901\.Client/,
  );
});

test("force-list mode enumerates every tracked file as a refresh candidate", () => {
  const changes = collectChanges({ forceList: true, head: "HEAD", files: [] });
  assert.ok(changes.some((change) => change.status === "A" && change.path === "live2d/live2d-core.js"));
  assert.ok(changes.every((change) => change.status === "A"));
});

test("uses the repository refresh-cdn.list by default", () => {
  assert.deepEqual(filterChangesByRefreshList([
    { status: "M", path: "live2d/live2d-core.js" },
    { status: "M", path: "live2d/README.md" },
    { status: "M", path: "scripts/refresh-cdn.js" },
  ]), [
    { status: "M", path: "live2d/live2d-core.js" },
  ]);
});

test("selects changed files with gitignore-style allowlist rules", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-cdn-test-"));
  const listPath = path.join(directory, "refresh-cdn.list");
  fs.writeFileSync(listPath, "/live2d/**\n!/live2d/README.md\n/assets/logo.png\n", "utf8");

  try {
    assert.deepEqual(filterChangesByRefreshList([
      { status: "M", path: "live2d/live2d-core.js" },
      { status: "M", path: "live2d/README.md" },
      { status: "M", path: "assets/logo.png" },
      { status: "M", path: "scripts/refresh-cdn.js" },
      { status: "R", oldPath: "live2d/old.js", path: "archive/old.js" },
      { status: "R", oldPath: "archive/new.js", path: "live2d/new.js" },
    ], listPath), [
      { status: "M", path: "live2d/live2d-core.js" },
      { status: "M", path: "assets/logo.png" },
      { status: "D", path: "live2d/old.js" },
      { status: "A", path: "live2d/new.js" },
    ]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("maps modified, deleted and renamed assets to the correct operations", () => {
  const targets = buildTargets([
    { status: "M", path: "live2d/a file.js" },
    { status: "D", path: "live2d/deleted.js" },
    { status: "R", oldPath: "live2d/old.js", path: "live2d/new.js" },
  ], "https://cdn.example.com/assets");

  assert.deepEqual(targets.purgeUrls, [
    "https://cdn.example.com/assets/live2d/a%20file.js",
    "https://cdn.example.com/assets/live2d/deleted.js",
    "https://cdn.example.com/assets/live2d/new.js",
    "https://cdn.example.com/assets/live2d/old.js",
  ]);
  assert.deepEqual(targets.prefetchUrls, [
    "https://cdn.example.com/assets/live2d/a%20file.js",
    "https://cdn.example.com/assets/live2d/new.js",
  ]);
  assert.deepEqual(targets.prefixPaths, ["live2d/"]);
});

test("builds immediate directory targets and a fixed manual prefix", () => {
  const changes = [
    { status: "M", path: "live2d/models/Ava/Ava.model3.json" },
    { status: "M", path: "live2d/libs/live2d.css" },
  ];
  assert.deepEqual(buildTargets(changes, "https://cdn.example.com").prefixPaths, [
    "live2d/libs/",
    "live2d/models/Ava/",
  ]);
  assert.deepEqual(buildTargets(changes, "https://cdn.example.com", true).prefixPaths, ["live2d/"]);
});

test("collapses directory targets toward their safe top-level root", () => {
  assert.deepEqual(collapsePrefixPathsToLimit([
    "live2d/models/Ava/",
    "live2d/models/Diana/",
    "live2d/libs/",
  ], 1), ["live2d/"]);
  assert.equal(collapsePrefixPathsToLimit(["live2d/", "assets/"], 1), null);
});

function quotaResponse({ url = 1000, prefix = 50, prefetch = 0 } = {}) {
  return {
    PurgeQuota: [
      { Type: "purge_url", Batch: url > 0 ? 500 : 0, Daily: 1000, DailyAvailable: url },
      { Type: "purge_prefix", Batch: prefix > 0 ? 50 : 0, Daily: 50, DailyAvailable: prefix },
    ],
    PrefetchQuota: [
      { Type: "prefetch_url", Batch: prefetch > 0 ? 500 : 0, Daily: prefetch, DailyAvailable: prefetch },
    ],
  };
}

function sampleTargetPlan() {
  return {
    purgeUrls: ["https://cdn.example.com/live2d/a.js", "https://cdn.example.com/live2d/b.js"],
    prefetchUrls: ["https://cdn.example.com/live2d/a.js", "https://cdn.example.com/live2d/b.js"],
    prefixPaths: ["live2d/"],
  };
}

test("selects purge mode by quota ratio and breaks ties in favor of URL", () => {
  const targetPlan = sampleTargetPlan();
  const urlPreferred = buildPurgeCandidates({
    targetPlan,
    domain: "https://cdn.example.com",
    quotaResponse: quotaResponse({ url: 1000, prefix: 50 }),
    maxTargetsPerRun: 1000,
    forceList: false,
  });
  assert.equal(orderPurgeCandidates(urlPreferred, false)[0].mode, "url");

  const prefixPreferred = buildPurgeCandidates({
    targetPlan,
    domain: "https://cdn.example.com",
    quotaResponse: quotaResponse({ url: 5, prefix: 50 }),
    maxTargetsPerRun: 1000,
    forceList: false,
  });
  assert.equal(orderPurgeCandidates(prefixPreferred, false)[0].mode, "prefix");

  const tiedPlan = { ...targetPlan, purgeUrls: [targetPlan.purgeUrls[0]], prefixPaths: ["live2d/"] };
  const tied = buildPurgeCandidates({
    targetPlan: tiedPlan,
    domain: "https://cdn.example.com",
    quotaResponse: quotaResponse({ url: 50, prefix: 50 }),
    maxTargetsPerRun: 1000,
    forceList: false,
  });
  assert.equal(orderPurgeCandidates(tied, false)[0].mode, "url");
});

test("uses whichever purge mode still has quota", () => {
  const targetPlan = sampleTargetPlan();
  const directoryOnly = buildPurgeCandidates({
    targetPlan,
    domain: "https://cdn.example.com",
    quotaResponse: quotaResponse({ url: 0, prefix: 50 }),
    maxTargetsPerRun: 1000,
    forceList: false,
  });
  assert.equal(orderPurgeCandidates(directoryOnly, false)[0].mode, "prefix");

  const urlOnly = buildPurgeCandidates({
    targetPlan,
    domain: "https://cdn.example.com",
    quotaResponse: quotaResponse({ url: 1000, prefix: 0 }),
    maxTargetsPerRun: 1000,
    forceList: false,
  });
  assert.equal(orderPurgeCandidates(urlOnly, false)[0].mode, "url");
});

test("manual force refresh prefers purge_prefix with direct deletion", () => {
  const candidates = buildPurgeCandidates({
    targetPlan: sampleTargetPlan(),
    domain: "https://cdn.example.com",
    quotaResponse: quotaResponse(),
    maxTargetsPerRun: 1000,
    forceList: true,
  });
  const selected = orderPurgeCandidates(candidates, true)[0];
  assert.equal(selected.mode, "prefix");
  assert.deepEqual(selected.createParams, { Type: "purge_prefix", Method: "delete" });
  assert.deepEqual(selected.targets, ["https://cdn.example.com/live2d/"]);
});

test("falls back to the alternate purge mode after any primary failure", async () => {
  const attempts = [];
  const warnings = [];
  const result = await runPurgeWithFallback({
    targetPlan: sampleTargetPlan(),
    domain: "https://cdn.example.com",
    initialQuotaResponse: quotaResponse({ url: 1000, prefix: 1 }),
    maxTargetsPerRun: 1000,
    forceList: false,
    refreshQuota: async () => quotaResponse({ url: 998, prefix: 1 }),
    executeCandidate: async (candidate) => {
      attempts.push(candidate.mode);
      if (candidate.mode === "url") throw new Error("URL purge failed");
      return [{ id: "prefix-job" }];
    },
    warn: (title, message) => warnings.push(`${title}: ${message}`),
  });
  assert.deepEqual(attempts, ["url", "prefix"]);
  assert.equal(result.candidate.mode, "prefix");
  assert.equal(result.fallback, true);
  assert.match(warnings[0], /⚠ URL purge failed/);
});

test("fails only when no purge mode has capacity", async () => {
  await assert.rejects(() => runPurgeWithFallback({
    targetPlan: sampleTargetPlan(),
    domain: "https://cdn.example.com",
    initialQuotaResponse: quotaResponse({ url: 0, prefix: 0 }),
    maxTargetsPerRun: 1000,
    forceList: false,
    refreshQuota: async () => quotaResponse({ url: 0, prefix: 0 }),
    executeCandidate: async () => [],
  }), /No purge method is available/);
});

test("reports both errors when primary and fallback purge fail", async () => {
  await assert.rejects(() => runPurgeWithFallback({
    targetPlan: sampleTargetPlan(),
    domain: "https://cdn.example.com",
    initialQuotaResponse: quotaResponse({ url: 1000, prefix: 1 }),
    maxTargetsPerRun: 1000,
    forceList: false,
    refreshQuota: async () => quotaResponse({ url: 998, prefix: 1 }),
    executeCandidate: async (candidate) => { throw new Error(`${candidate.mode} exploded`); },
    warn: () => {},
  }), /URL purge failed \(url exploded\); directory purge also failed \(prefix exploded\)/);
});

test("prefetch quota exhaustion is a warning and never blocks purge success", async () => {
  const warnings = [];
  let executed = false;
  const result = await runBestEffortPrefetch({
    urls: sampleTargetPlan().prefetchUrls,
    quota: { Type: "prefetch_url", Batch: 0, Daily: 0, DailyAvailable: 0 },
    maxTargetsPerRun: 1000,
    execute: async () => { executed = true; return []; },
    warn: (title, message) => warnings.push(`${title}: ${message}`),
  });
  assert.equal(result.status, "Skipped");
  assert.equal(executed, false);
  assert.match(warnings[0], /⚠ Prefetch skipped/);
});

test("prefetch task errors become warnings", async () => {
  const warnings = [];
  const result = await runBestEffortPrefetch({
    urls: ["https://cdn.example.com/live2d/a.js"],
    quota: { Type: "prefetch_url", Batch: 10, Daily: 10, DailyAvailable: 10 },
    maxTargetsPerRun: 1000,
    execute: async () => { throw new Error("origin unavailable"); },
    warn: (title, message) => warnings.push(`${title}: ${message}`),
  });
  assert.equal(result.status, "Warning");
  assert.match(warnings[0], /⚠ Prefetch failed/);
});

test("quota assessment rejects insufficient daily capacity", () => {
  assert.equal(assessQuota("URL purge", 2, { Batch: 500, DailyAvailable: 1 }, 1000).available, false);
});

test("parses NUL-delimited git name-status output", () => {
  assert.deepEqual(
    parseNameStatus("M\0live2d/a.js\0R100\0live2d/old.js\0live2d/new.js\0D\0live2d/deleted.js\0"),
    [
      { status: "M", path: "live2d/a.js" },
      { status: "R", oldPath: "live2d/old.js", path: "live2d/new.js" },
      { status: "D", path: "live2d/deleted.js" },
    ],
  );
});
