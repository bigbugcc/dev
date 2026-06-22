"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildTargets, parseNameStatus } = require("./refresh-cdn");

test("maps modified, deleted and renamed assets to the correct operations", () => {
  const targets = buildTargets([
    { status: "M", path: "live2d/a file.js" },
    { status: "D", path: "live2d/deleted.js" },
    { status: "R", oldPath: "live2d/old.js", path: "live2d/new.js" },
    { status: "M", path: "live2d/README.md" },
    { status: "M", path: "scripts/refresh-cdn.js" },
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
