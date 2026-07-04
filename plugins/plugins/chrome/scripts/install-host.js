#!/usr/bin/env node

(async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const crypto = await import("node:crypto");
  const childProcess = await import("node:child_process");
  const process = (await import("node:process")).default;

  const EXTENSION_ID = "ldgomdocohcifomdiadgchoegehldnah";
  const HOST_NAME = "com.local.browser_agent_bridge";
  const SUPPORT_DIR_NAME = "Chrome Control";
  const ENV_FILE_NAME = ".browser-agent-bridge.env";
  const REGISTRY_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
  const CHECK_ONLY = process.argv.includes("--check");

  function fail(message, suggestion) {
    process.stderr.write(`Error: ${message}\n`);
    if (suggestion) {
      process.stderr.write(`Next step: ${suggestion}\n`);
    }
    process.exit(1);
  }

  function info(message) {
    process.stdout.write(`${message}\n`);
  }

  function isWindows() {
    return process.platform === "win32";
  }

  function requireNode18() {
    const major = Number(process.versions.node.split(".")[0]);
    if (!Number.isFinite(major) || major < 18) {
      fail(
        `Node.js 18 or newer is required; found ${process.version}.`,
        "Install Node.js 18+ and rerun: node scripts/install-host.js"
      );
    }
  }

  function getUserProfile() {
    const userProfile = process.env.USERPROFILE || os.homedir();
    if (!userProfile) {
      fail(
        "USERPROFILE is not set, so the token env file path cannot be determined.",
        "Open a normal Windows terminal session and rerun: node scripts/install-host.js"
      );
    }
    return userProfile;
  }

  function getLocalAppData() {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      fail(
        "LOCALAPPDATA is not set, so the Chrome Native Messaging manifest path cannot be determined.",
        "Open a normal Windows terminal session and rerun: node scripts/install-host.js"
      );
    }
    return localAppData;
  }

  function paths() {
    const scriptPath = path.resolve(process.argv[1] || __filename);
    const scriptsDir = path.dirname(scriptPath);
    const pluginDir = path.resolve(scriptsDir, "..");
    const sourceHost = path.join(pluginDir, "extension-host", "windows", "x64", "host.exe");
    const userProfile = getUserProfile();
    const localAppData = getLocalAppData();
    const supportDir = path.join(localAppData, SUPPORT_DIR_NAME);
    const nativeDir = path.join(supportDir, "native");
    const targetHost = path.join(nativeDir, "host.exe");
    const wrapper = path.join(supportDir, "host-wrapper.win.bat");
    const manifest = path.join(
      localAppData,
      "Google",
      "Chrome",
      "NativeMessagingHosts",
      `${HOST_NAME}.json`
    );
    const envFile = path.join(userProfile, ENV_FILE_NAME);

    return {
      scriptPath,
      pluginDir,
      sourceHost,
      userProfile,
      localAppData,
      supportDir,
      nativeDir,
      targetHost,
      wrapper,
      manifest,
      envFile,
    };
  }

  function ensureDir(directory) {
    fs.mkdirSync(directory, { recursive: true });
  }

  function fileExists(filePath) {
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }

  function readTextIfExists(filePath, encoding = "utf8") {
    try {
      return fs.readFileSync(filePath, encoding);
    } catch {
      return null;
    }
  }

  function normalizeNewlines(value) {
    return value.replace(/\r\n/g, "\n");
  }

  function manifestJson(wrapperPath) {
    return `${JSON.stringify(
      {
        name: HOST_NAME,
        description: "Chrome Control Native Messaging Host",
        path: wrapperPath,
        type: "stdio",
        allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
      },
      null,
      2
    )}\n`;
  }

  function wrapperBat(hostPath) {
    return [
      "@echo off",
      "setlocal",
      'if "%BROWSER_AGENT_BRIDGE_ENV_FILE%"=="" set "BROWSER_AGENT_BRIDGE_ENV_FILE=%USERPROFILE%\\.browser-agent-bridge.env"',
      'if exist "%BROWSER_AGENT_BRIDGE_ENV_FILE%" (',
      '  for /f "usebackq tokens=1,* delims==" %%A in ("%BROWSER_AGENT_BRIDGE_ENV_FILE%") do (',
      '    if not "%%A"=="" set "%%A=%%B"',
      "  )",
      ")",
      `set "BROWSER_AGENT_BRIDGE_EXTENSION_ID=${EXTENSION_ID}"`,
      `"${hostPath}" %*`,
      "endlocal",
      "",
    ].join("\r\n");
  }

  function ensureEnvFile(envFile) {
    if (fileExists(envFile)) {
      info(`[skip] token env already exists: ${envFile}`);
      return "skip";
    }
    ensureDir(path.dirname(envFile));
    const token = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(envFile, `BROWSER_AGENT_BRIDGE_TOKEN=${token}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    info(`[write] token env: ${envFile}`);
    return "write";
  }

  function ensureSourceHost(sourceHost) {
    if (!fileExists(sourceHost)) {
      fail(
        `Bundled native host is missing: ${sourceHost}`,
        "The Chrome plugin sync looks incomplete. Re-sync or reinstall the plugin, then rerun this installer."
      );
    }
    info(`[skip] bundled host already present: ${sourceHost}`);
  }

  function shouldCopy(sourceHost, targetHost) {
    if (!fileExists(targetHost)) {
      return true;
    }
    const source = fs.statSync(sourceHost);
    const target = fs.statSync(targetHost);
    return source.size !== target.size || source.mtimeMs > target.mtimeMs + 1;
  }

  function ensureHostCopy(sourceHost, targetHost) {
    if (!shouldCopy(sourceHost, targetHost)) {
      info(`[skip] native host is current: ${targetHost}`);
      return "skip";
    }
    ensureDir(path.dirname(targetHost));
    fs.copyFileSync(sourceHost, targetHost);
    const source = fs.statSync(sourceHost);
    fs.utimesSync(targetHost, source.atime, source.mtime);
    info(`[copy] native host: ${targetHost}`);
    return "copy";
  }

  function ensureTextFile(filePath, content, encoding, label) {
    const existing = readTextIfExists(filePath, encoding);
    if (existing !== null && normalizeNewlines(existing) === normalizeNewlines(content)) {
      info(`[skip] ${label} is current: ${filePath}`);
      return "skip";
    }
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, { encoding });
    info(`[write] ${label}: ${filePath}`);
    return "write";
  }

  function runReg(args) {
    if (process.env.NEXTS_CHROME_TEST_REG_SCRIPT) {
      return childProcess.spawnSync(process.execPath, [process.env.NEXTS_CHROME_TEST_REG_SCRIPT, ...args], {
        encoding: "utf8",
        windowsHide: true,
      });
    }
    const regCommand = process.env.NEXTS_CHROME_TEST_REG_EXE || "reg.exe";
    return childProcess.spawnSync(regCommand, args, {
      encoding: "utf8",
      windowsHide: true,
    });
  }

  function ensureRegistry(manifestPath) {
    if (registryPointsToManifest(manifestPath)) {
      info(`[skip] registry already points to manifest: ${REGISTRY_KEY}`);
      return "skip";
    }
    const result = runReg([
      "add",
      REGISTRY_KEY,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      manifestPath,
      "/f",
    ]);
    if (result.status !== 0) {
      const detail = (result.error?.message || result.stderr || result.stdout || "").trim();
      fail(
        `Failed to register the Chrome Native Messaging host.${detail ? ` ${detail}` : ""}`,
        "Run this installer from a normal Windows terminal. Administrator rights are not required because it writes HKCU."
      );
    }
    info(`[ok] registry default value set: ${REGISTRY_KEY}`);
    return "ok";
  }

  function registryPointsToManifest(manifestPath) {
    const result = runReg(["query", REGISTRY_KEY, "/ve"]);
    if (result.status !== 0) {
      return false;
    }
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    return output.toLowerCase().includes(manifestPath.toLowerCase());
  }

  function readJson(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  function check(paths) {
    const expectedManifest = readJson(paths.manifest);
    const expectedWrapper = wrapperBat(paths.targetHost);
    const statuses = [
      ["token env", fileExists(paths.envFile), paths.envFile],
      ["bundled host", fileExists(paths.sourceHost), paths.sourceHost],
      ["installed host", fileExists(paths.targetHost), paths.targetHost],
      [
        "wrapper",
        readTextIfExists(paths.wrapper, "ascii") === expectedWrapper,
        paths.wrapper,
      ],
      [
        "manifest",
        Boolean(
          expectedManifest &&
            expectedManifest.name === HOST_NAME &&
            expectedManifest.path === paths.wrapper &&
            expectedManifest.type === "stdio" &&
            Array.isArray(expectedManifest.allowed_origins) &&
            expectedManifest.allowed_origins.includes(`chrome-extension://${EXTENSION_ID}/`)
        ),
        paths.manifest,
      ],
      ["registry", registryPointsToManifest(paths.manifest), REGISTRY_KEY],
    ];

    let ok = true;
    for (const [label, passed, location] of statuses) {
      if (!passed) ok = false;
      info(`[${passed ? "ok" : "missing"}] ${label}: ${location}`);
    }
    if (!ok) {
      info("Next step: run node scripts/install-host.js, then fully restart Chrome.");
      process.exit(1);
    }
    info("All Chrome Native Messaging host pieces are installed.");
  }

  function install(paths) {
    ensureEnvFile(paths.envFile);
    ensureSourceHost(paths.sourceHost);
    ensureHostCopy(paths.sourceHost, paths.targetHost);
    ensureTextFile(paths.wrapper, wrapperBat(paths.targetHost), "ascii", "wrapper");
    ensureTextFile(paths.manifest, manifestJson(paths.wrapper), "utf8", "manifest");
    ensureRegistry(paths.manifest);
    info("");
    info("Chrome Native Messaging host installation summary:");
    info(`- Token env: ${paths.envFile}`);
    info(`- Native host: ${paths.targetHost}`);
    info(`- Wrapper: ${paths.wrapper}`);
    info(`- Manifest: ${paths.manifest}`);
    info(`- Registry: ${REGISTRY_KEY}`);
    info("");
    info("IMPORTANT: Fully restart Chrome before this takes effect.");
    info("After restarting Chrome, verify with: node scripts/browser-client.js health");
  }

  requireNode18();

  if (!isWindows()) {
    fail(
      "This installer currently supports Windows only.",
      "For other platforms, see the Chrome plugin README."
    );
  }

  const resolvedPaths = paths();
  if (CHECK_ONLY) {
    check(resolvedPaths);
    return;
  }
  install(resolvedPaths);
})().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.stderr.write("Next step: rerun with --check to see which install piece is missing.\n");
  process.exit(1);
});
