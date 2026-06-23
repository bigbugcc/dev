"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  buildTargets,
  collectChanges,
  filterChangesByRefreshList,
  parseNameStatus,
  resolveTeoClient,
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
