#!/usr/bin/env node
/**
 * Generate codebase metrics (cloc, jscpd, complexity) and emit a normalized snapshot.
 * Usage:
 *   node scripts/metrics/run.js --label before
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const fg = require("fast-glob");
const escomplex = require("escomplex");

const ROOT = path.resolve(__dirname, "../..");
const REPORT_DIR = path.join(ROOT, "reports", "metrics");
const SNAPSHOT_DIR = path.join(REPORT_DIR, "snapshots");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function runCmd(cmd, options = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (key === "--label") {
      params.label = args[i + 1];
      i += 1;
    }
  }
  return {
    label: params.label || "snapshot",
  };
}

function runCloc() {
  const outFile = path.join(REPORT_DIR, "cloc.json");
  const cmd = [
    "npx",
    "cloc",
    "templates",
    "scripts",
    "styles",
    "--json",
    "--quiet",
    "--hide-rate",
    "--exclude-dir=.git,node_modules,styles/css,dist,build,coverage,packs,reports",
  ].join(" ");
  const output = runCmd(cmd);
  fs.writeFileSync(outFile, output, "utf8");
  return JSON.parse(output);
}

function runJscpd() {
  ensureDir(REPORT_DIR);
  const outFile = path.join(REPORT_DIR, "jscpd-report.json");
  const cmd = [
    "npx",
    "jscpd",
    '--reporters "json"',
    `--output "${REPORT_DIR}"`,
    '--path "templates"',
    '--path "styles"',
    '--path "scripts"',
    '--format "javascript,handlebars,scss"',
    '--ignore "**/styles/css/**" --ignore "**/node_modules/**" --ignore "**/dist/**" --ignore "**/build/**" --ignore "**/coverage/**" --ignore "**/reports/**"',
    "--min-lines 5",
    "--min-tokens 50",
    "--silent",
  ].join(" ");
  runCmd(cmd);
  const data = JSON.parse(fs.readFileSync(outFile, "utf8"));
  return data;
}

function runComplexity() {
  const pattern = [
    "scripts/**/*.js",
    "!**/node_modules/**",
    "!**/dist/**",
    "!**/build/**",
    "!**/coverage/**",
    "!**/styles/css/**",
    "!**/reports/**",
  ];
  const files = fg.sync(pattern, { cwd: ROOT, absolute: true });
  const modules = files.map((file) => ({
    path: path.relative(ROOT, file),
    code: fs.readFileSync(file, "utf8"),
  }));
  if (!modules.length) return null;
  const report = escomplex.analyse(modules, { logicalor: false, switchcase: true });
  const functions = [];
  for (const mod of report.reports) {
    for (const fn of mod.functions || []) {
      functions.push({
        path: mod.path,
        name: fn.name,
        cyclomatic: fn.cyclomatic,
        params: fn.params,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
      });
    }
  }
  functions.sort((a, b) => b.cyclomatic - a.cyclomatic);
  const topFunctions = functions.slice(0, 10);
  const maxCyclomatic = functions[0]?.cyclomatic || 0;
  return {
    aggregate: report.aggregate || {},
    functions: functions.length,
    maxCyclomatic,
    topFunctions,
  };
}

function buildSnapshot(label, cloc, jscpd, complexity) {
  const languages = cloc
    ? Object.keys(cloc).filter((k) => k !== "header")
    : [];
  const clocSummary = {
    languages: {},
    files: cloc?.header?.n_files || 0,
  };
  for (const lang of languages) {
    if (lang === "SUM") continue;
    const { nFiles, code, comment, blank } = cloc[lang];
    clocSummary.languages[lang] = { files: nFiles, code, comment, blank };
  }

  const duplication = jscpd?.statistics?.total;
  const snapshot = {
    label,
    generatedAt: new Date().toISOString(),
    cloc: clocSummary,
    jscpd: duplication
      ? {
        lines: duplication.lines,
        sources: duplication.sources,
        clones: duplication.clones,
        percentage: duplication.percentage,
      }
      : null,
    complexity: complexity
      ? {
        maxCyclomatic: complexity.maxCyclomatic,
        functions: complexity.functions,
        topFunctions: complexity.topFunctions,
      }
      : null,
  };
  return snapshot;
}

function main() {
  const { label } = parseArgs();
  ensureDir(REPORT_DIR);
  ensureDir(SNAPSHOT_DIR);

  console.log("Running cloc...");
  const cloc = runCloc();

  console.log("Running jscpd...");
  const jscpd = runJscpd();

  console.log("Running complexity...");
  const complexity = runComplexity();

  const snapshot = buildSnapshot(label, cloc, jscpd, complexity);
  const snapshotPath = path.join(REPORT_DIR, "snapshot.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");

  const labeledPath = path.join(SNAPSHOT_DIR, `${label}.json`);
  fs.writeFileSync(labeledPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(`Metrics written to ${snapshotPath}`);
  console.log(`Labeled snapshot: ${labeledPath}`);
}

if (require.main === module) {
  main();
}
