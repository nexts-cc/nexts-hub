#!/usr/bin/env node

(async () => {
  const fs = await import("node:fs");
  const http = await import("node:http");
  const path = await import("node:path");
  const childProcess = await import("node:child_process");
  const process = (await import("node:process")).default;

  const HOST = "127.0.0.1";
  const PORT = 18765;
  const HEALTH_PATH = "/health";
  const INITIAL_TIMEOUT_MS = 1500;
  const POLL_TIMEOUT_MS = Number(process.env.NEXTS_CHROME_TIMEOUT_MS || 20000);
  const POLL_INTERVAL_MS = Number(process.env.NEXTS_CHROME_POLL_MS || 1000);
  const testHealthSteps = process.env.NEXTS_CHROME_TEST_HEALTH_SEQUENCE
    ? process.env.NEXTS_CHROME_TEST_HEALTH_SEQUENCE.split(";").filter(Boolean)
    : null;
  let testHealthIndex = 0;

  function info(message) {
    process.stdout.write(`${message}\n`);
  }

  function error(message) {
    process.stderr.write(`${message}\n`);
  }

  function platform() {
    return process.env.NEXTS_CHROME_TEST_PLATFORM || process.platform;
  }

  function scriptDir() {
    return path.dirname(path.resolve(process.argv[1]));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function parseHealthBody(data, statusCode) {
    if (!data) return { statusCode };
    try {
      return JSON.parse(data);
    } catch {
      return { statusCode, raw: data };
    }
  }

  function healthSummary(health) {
    return JSON.stringify(health);
  }

  function requestHealth(timeoutMs) {
    if (testHealthSteps) {
      const step = testHealthSteps[Math.min(testHealthIndex, testHealthSteps.length - 1)];
      testHealthIndex += 1;
      if (step === "fail") {
        return Promise.resolve({ ok: false, error: new Error("mocked health failure") });
      }
      if (step.startsWith("ok:")) {
        return Promise.resolve({ ok: true, health: JSON.parse(step.slice(3)) });
      }
      return Promise.resolve({ ok: true, health: { ok: true } });
    }

    return new Promise((resolve) => {
      const req = http.request(
        {
          host: HOST,
          port: PORT,
          path: HEALTH_PATH,
          method: "GET",
          headers: { accept: "application/json" },
          timeout: timeoutMs,
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              health: parseHealthBody(data, res.statusCode),
            });
          });
        }
      );
      req.on("timeout", () => req.destroy(new Error("health timed out")));
      req.on("error", (err) => resolve({ ok: false, error: err }));
      req.end();
    });
  }

  function chromeIsRunning() {
    if (process.env.NEXTS_CHROME_TEST_TASKLIST_OUTPUT !== undefined) {
      return /chrome\.exe/i.test(process.env.NEXTS_CHROME_TEST_TASKLIST_OUTPUT);
    }

    const result = childProcess.spawnSync(
      "tasklist",
      ["/FI", "IMAGENAME eq chrome.exe", "/NH"],
      { encoding: "utf8", windowsHide: true }
    );
    if (result.error) {
      throw new Error(`Failed to run tasklist: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "").trim();
      throw new Error(`tasklist failed.${detail ? ` ${detail}` : ""}`);
    }
    return /chrome\.exe/i.test(result.stdout || "");
  }

  function chromePathCandidates() {
    if (process.env.NEXTS_CHROME_TEST_CHROME_PATHS !== undefined) {
      if (process.env.NEXTS_CHROME_TEST_CHROME_PATHS === "__none__") {
        return [];
      }
      return process.env.NEXTS_CHROME_TEST_CHROME_PATHS.split(";").filter(Boolean);
    }

    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    const localAppData = process.env.LOCALAPPDATA;
    return [
      programFiles && path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      programFilesX86 && path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    ].filter(Boolean);
  }

  function spawnDetached(command, args) {
    if (process.env.NEXTS_CHROME_TEST_SKIP_LAUNCH === "1") {
      return true;
    }
    try {
      const child = childProcess.spawn(command, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return true;
    } catch {
      return false;
    }
  }

  function launchChrome() {
    info("[launch] starting Chrome...");
    const forceCmdStartFail = process.env.NEXTS_CHROME_TEST_CMD_START_FAIL === "1";
    if (!forceCmdStartFail && spawnDetached("cmd", ["/c", "start", "", "chrome"])) {
      return;
    }

    for (const chromePath of chromePathCandidates()) {
      if (fs.existsSync(chromePath) && spawnDetached(chromePath, [])) {
        return;
      }
    }

    error("[error] Chrome does not appear to be installed.");
    error("Next step: install Google Chrome, then rerun: node scripts/ensure-chrome.js");
    process.exit(1);
  }

  async function waitForBridge() {
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      const result = await requestHealth(Math.min(POLL_INTERVAL_MS, 1500));
      if (result.ok) {
        info(`[ok] bridge reachable ${healthSummary(result.health)}`);
        return true;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    return false;
  }

  function installPiecesAreMissing() {
    if (process.env.NEXTS_CHROME_TEST_INSTALL_CHECK_STATUS !== undefined) {
      return process.env.NEXTS_CHROME_TEST_INSTALL_CHECK_STATUS !== "0";
    }

    const installHost = path.join(scriptDir(), "install-host.js");
    const result = childProcess.spawnSync(process.execPath, [installHost, "--check"], {
      encoding: "utf8",
      windowsHide: true,
    });
    return result.status !== 0;
  }

  function printTimeoutAdvice() {
    const timeoutSeconds = Math.max(1, Math.ceil(POLL_TIMEOUT_MS / 1000));
    error(`[error] bridge did not become reachable within ${timeoutSeconds}s.`);
    if (installPiecesAreMissing()) {
      error("Next step: run node scripts/install-host.js, then fully restart Chrome.");
      return;
    }
    error(
      "Next step: check that the Nexts AI Chrome extension is enabled at chrome://extensions. If needed, disable and re-enable it."
    );
  }

  if (platform() !== "win32") {
    error("[error] ensure-chrome currently supports Windows only.");
    error("Next step: start Chrome manually and verify the bridge on this platform.");
    process.exit(1);
  }

  const initial = await requestHealth(INITIAL_TIMEOUT_MS);
  if (initial.ok) {
    info(`[ok] bridge reachable ${healthSummary(initial.health)}`);
    return;
  }

  let running;
  try {
    running = chromeIsRunning();
  } catch (err) {
    error(`[error] ${err.message}`);
    process.exit(1);
  }

  if (running) {
    info("[info] Chrome is running, waiting for the bridge...");
  } else {
    launchChrome();
  }

  if (await waitForBridge()) {
    return;
  }

  printTimeoutAdvice();
  process.exit(1);
})().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  process.stderr.write(`[error] ${message}\n`);
  process.exit(1);
});
