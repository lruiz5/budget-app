/**
 * Budget App Windows Installer Build Script (v2.0.0)
 *
 * Builds both the Next.js client and Hono API server for standalone
 * Windows distribution with optional NSIS installer.
 *
 * Steps:
 * 1. Build Next.js in standalone mode
 * 2. Bundle API server with esbuild (single file, PGlite external)
 * 3. Download Node.js portable runtime (cached)
 * 4. Prepare standalone directory (Next.js + API server + startup scripts)
 * 5. Verify the build
 * 6. Create distribution packages (Server, Client, Full)
 * 7. Run NSIS to create Windows installers (optional)
 *
 * Usage:
 *   node installer/build-installer.js [--skip-build] [--skip-inno]
 *
 * Prerequisites:
 *   - Node.js 20+ and pnpm (for building)
 *   - NSIS 3+ (for creating installer, optional)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import shared utilities
const {
  APP_VERSION, NODE_VERSION, PROJECT_ROOT, DIST_DIR, STANDALONE_DIR,
  NODE_CACHE_DIR, DISTRIBUTE_DIR, PLATFORM_CONFIG, colors,
  log, logStep, logSuccess, logWarning, logError,
  downloadFile, extractZip, copyDir, cleanDir, getDirSize,
  stripUnnecessaryModules, fixPnpmLayout, findMakeNsis, buildNsisInstaller,
  generateServerStartJs, generateClientStartJs, generateFullStartJs,
} = require('./build-utils');

// Windows-specific paths
const NODE_DIR = path.join(DIST_DIR, 'node');

// Parse command line arguments
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const skipInno = args.includes('--skip-inno');

/**
 * Step 1: Build Next.js in standalone mode
 */
async function buildNextJs() {
  logStep('1/7', 'Building Next.js application...');

  if (skipBuild) {
    logWarning('Skipping build (--skip-build flag)');
    return;
  }

  const nextDir = path.join(PROJECT_ROOT, '.next');
  if (fs.existsSync(nextDir)) {
    log('  Cleaning previous build...');
    fs.rmSync(nextDir, { recursive: true, force: true });
  }

  log('  Running next build...');
  execSync('pnpm build', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  logSuccess('Next.js build complete');
}

/**
 * Step 2: Bundle API server with esbuild
 */
async function bundleApiServer() {
  logStep('2/7', 'Bundling API server...');

  if (skipBuild) {
    logWarning('Skipping build (--skip-build flag)');
    return;
  }

  const outDir = path.join(STANDALONE_DIR, 'api-server');
  fs.mkdirSync(outDir, { recursive: true });

  const entryPoint = path.join(PROJECT_ROOT, 'packages', 'server', 'src', 'index.ts');

  if (!fs.existsSync(entryPoint)) {
    throw new Error(`API server entry point not found: ${entryPoint}`);
  }

  log('  Running esbuild...');
  execSync(
    [
      'npx esbuild',
      `"${entryPoint}"`,
      '--bundle',
      '--platform=node',
      '--target=node20',
      '--format=esm',
      `--outfile="${path.join(outDir, 'index.mjs')}"`,
      '--external:@electric-sql/pglite',
    ].join(' '),
    {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    }
  );

  logSuccess('API server bundled');

  log('  Copying PGlite runtime...');
  const pgliteSrc = path.join(PROJECT_ROOT, 'node_modules', '@electric-sql', 'pglite');
  const pgliteDest = path.join(outDir, 'node_modules', '@electric-sql', 'pglite');

  if (!fs.existsSync(pgliteSrc)) {
    throw new Error(`PGlite package not found at ${pgliteSrc}`);
  }

  copyDir(pgliteSrc, pgliteDest);
  logSuccess('PGlite runtime copied');
}

/**
 * Step 3: Download Node.js portable runtime (Windows)
 */
async function downloadNodeJs() {
  logStep('3/7', 'Preparing Node.js runtime...');

  const nodeExePath = path.join(NODE_DIR, 'node.exe');
  const config = PLATFORM_CONFIG.win32;
  const cacheZipPath = path.join(NODE_CACHE_DIR, config.nodeFilename(NODE_VERSION));

  if (fs.existsSync(nodeExePath)) {
    logSuccess(`Node.js ${NODE_VERSION} already available`);
    return;
  }

  fs.mkdirSync(NODE_CACHE_DIR, { recursive: true });
  fs.mkdirSync(NODE_DIR, { recursive: true });

  if (!fs.existsSync(cacheZipPath)) {
    log(`  Downloading Node.js ${NODE_VERSION}...`);
    await downloadFile(config.nodeUrl(NODE_VERSION), cacheZipPath);
    logSuccess('Download complete');
  } else {
    logSuccess('Using cached Node.js download');
  }

  const tempExtractDir = path.join(DIST_DIR, 'node-extract');
  cleanDir(tempExtractDir);
  extractZip(cacheZipPath, tempExtractDir);

  const extractedFolder = fs.readdirSync(tempExtractDir)[0];
  const extractedNodeExe = path.join(tempExtractDir, extractedFolder, 'node.exe');

  if (fs.existsSync(extractedNodeExe)) {
    fs.copyFileSync(extractedNodeExe, nodeExePath);
    logSuccess(`Node.js ${NODE_VERSION} extracted`);
  } else {
    throw new Error('Could not find node.exe in extracted archive');
  }

  fs.rmSync(tempExtractDir, { recursive: true, force: true });
}

/**
 * Detect the Next.js standalone project directory.
 * Next.js 16+ nests standalone output under a project-name subdirectory.
 */
function findStandaloneRoot(standaloneDir) {
  if (fs.existsSync(path.join(standaloneDir, 'server.js'))) {
    return standaloneDir;
  }

  const entries = fs.readdirSync(standaloneDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const candidate = path.join(standaloneDir, entry.name, 'server.js');
      if (fs.existsSync(candidate)) {
        log(`  Detected nested standalone layout: ${entry.name}/`);
        return path.join(standaloneDir, entry.name);
      }
    }
  }

  throw new Error(
    'Could not find server.js in Next.js standalone output. ' +
    'Check that next.config.ts has output: "standalone"'
  );
}

/**
 * Step 4: Prepare standalone directory
 */
async function prepareStandalone() {
  logStep('4/7', 'Preparing standalone package...');

  const nextStandalone = path.join(PROJECT_ROOT, '.next', 'standalone');
  const nextStatic = path.join(PROJECT_ROOT, '.next', 'static');
  const publicDir = path.join(PROJECT_ROOT, 'public');

  if (!fs.existsSync(nextStandalone)) {
    throw new Error(
      'Next.js standalone build not found. Make sure next.config.ts has output: "standalone"'
    );
  }

  const standaloneRoot = findStandaloneRoot(nextStandalone);

  log('  Copying standalone server files...');
  const standaloneEntries = fs.readdirSync(standaloneRoot, { withFileTypes: true });
  for (const entry of standaloneEntries) {
    const srcPath = path.join(standaloneRoot, entry.name);
    const destPath = path.join(STANDALONE_DIR, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  const destStatic = path.join(STANDALONE_DIR, '.next', 'static');
  if (fs.existsSync(nextStatic)) {
    log('  Copying static assets...');
    copyDir(nextStatic, destStatic);
  }

  const destPublic = path.join(STANDALONE_DIR, 'public');
  if (fs.existsSync(publicDir)) {
    log('  Copying public assets...');
    copyDir(publicDir, destPublic);
  }

  log('  Fixing pnpm module layout...');
  fixPnpmLayout(path.join(STANDALONE_DIR, 'node_modules'));

  log('  Copying startup script...');
  fs.copyFileSync(
    path.join(__dirname, 'start-production.js'),
    path.join(STANDALONE_DIR, 'start-production.js')
  );

  const envExample = path.join(PROJECT_ROOT, '.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(STANDALONE_DIR, '.env.example'));
  }

  logSuccess('Standalone package prepared');
}

/**
 * Step 5: Verify the build
 */
async function verifyBuild() {
  logStep('5/7', 'Verifying build...');

  const checks = [
    { path: path.join(STANDALONE_DIR, 'server.js'), name: 'Next.js server' },
    { path: path.join(STANDALONE_DIR, 'api-server', 'index.mjs'), name: 'API server bundle' },
    { path: path.join(STANDALONE_DIR, 'api-server', 'node_modules', '@electric-sql', 'pglite', 'package.json'), name: 'PGlite runtime' },
    { path: path.join(STANDALONE_DIR, 'start-production.js'), name: 'Startup script' },
    { path: path.join(NODE_DIR, 'node.exe'), name: 'Node.js runtime' },
  ];

  let allGood = true;
  for (const check of checks) {
    if (fs.existsSync(check.path)) {
      logSuccess(check.name);
    } else {
      logError(`${check.name} — MISSING at ${check.path}`);
      allGood = false;
    }
  }

  if (!allGood) {
    throw new Error('Build verification failed. Some files are missing.');
  }

  const apiBundle = path.join(STANDALONE_DIR, 'api-server', 'index.mjs');
  const apiSize = fs.statSync(apiBundle).size;
  log(`  API bundle size: ${(apiSize / 1024 / 1024).toFixed(1)} MB`);
}

/**
 * Step 6: Create separate Windows distribution packages
 */
async function createDistribution() {
  logStep('6/7', 'Creating Windows distribution packages...');

  const serverDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}`);
  const clientDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}`);

  fs.mkdirSync(DISTRIBUTE_DIR, { recursive: true });

  if (fs.existsSync(serverDir)) {
    fs.rmSync(serverDir, { recursive: true, force: true });
  }
  if (fs.existsSync(clientDir)) {
    fs.rmSync(clientDir, { recursive: true, force: true });
  }

  // --- SERVER PACKAGE ---
  log('  Packaging server...');
  fs.mkdirSync(serverDir, { recursive: true });

  const nodeExeSrc = path.join(NODE_DIR, 'node.exe');
  const iconSrc = path.join(PROJECT_ROOT, 'public', 'icon.ico');

  if (fs.existsSync(nodeExeSrc)) {
    fs.copyFileSync(nodeExeSrc, path.join(serverDir, 'node.exe'));
  }
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, path.join(serverDir, 'icon.ico'));
  }

  copyDir(
    path.join(STANDALONE_DIR, 'api-server'),
    path.join(serverDir, 'api-server')
  );

  const envExample = path.join(PROJECT_ROOT, '.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(serverDir, '.env.example'));
  }

  // Server startup script (shared generator — uses string concatenation, no template literals)
  fs.writeFileSync(path.join(serverDir, 'start-server.js'), generateServerStartJs(), 'utf8');

  fs.writeFileSync(path.join(serverDir, 'start-server.bat'), `@echo off
setlocal enabledelayedexpansion
title Budget App API Server

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if not exist "data" mkdir data

if exist "node.exe" (
    set "NODE_CMD=%SCRIPT_DIR%node.exe"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Node.js not found!
        pause
        exit /b 1
    )
    set "NODE_CMD=node"
)

"%NODE_CMD%" start-server.js

echo.
echo Server stopped.
pause
`, 'utf8');

  fs.writeFileSync(path.join(serverDir, 'stop-server.bat'), `@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if exist "data\\.pid" (
    set /p PID=<"data\\.pid"
    echo Stopping Budget App API Server (PID: %PID%)...
    taskkill /pid %PID% /f /t >nul 2>nul
    del "data\\.pid" >nul 2>nul
    echo Stopped.
) else (
    echo No running server found.
)
pause
`, 'utf8');

  logSuccess(`Server package: ${serverDir}`);

  // --- CLIENT PACKAGE ---
  log('  Packaging client...');
  fs.mkdirSync(clientDir, { recursive: true });

  if (fs.existsSync(nodeExeSrc)) {
    fs.copyFileSync(nodeExeSrc, path.join(clientDir, 'node.exe'));
  }
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, path.join(clientDir, 'icon.ico'));
  }

  const nextFiles = ['server.js', 'package.json'];
  for (const f of nextFiles) {
    const src = path.join(STANDALONE_DIR, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(clientDir, f));
    }
  }

  const nextDirs = ['.next', 'node_modules', 'public'];
  for (const d of nextDirs) {
    const src = path.join(STANDALONE_DIR, d);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(clientDir, d));
    }
  }

  const clientPnpmDir = path.join(clientDir, 'node_modules', '.pnpm');
  if (fs.existsSync(clientPnpmDir)) {
    log('  Removing .pnpm (already merged to top-level)...');
    fs.rmSync(clientPnpmDir, { recursive: true, force: true });
  }

  log('  Stripping unnecessary platform binaries...');
  stripUnnecessaryModules(path.join(clientDir, 'node_modules'));

  // Client startup script (shared generator — uses string concatenation, no template literals)
  fs.writeFileSync(path.join(clientDir, 'start-client.js'), generateClientStartJs(), 'utf8');

  fs.writeFileSync(path.join(clientDir, 'start-client.bat'), `@echo off
setlocal enabledelayedexpansion
title Budget App Web Client

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if exist "node.exe" (
    set "NODE_CMD=%SCRIPT_DIR%node.exe"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Node.js not found!
        pause
        exit /b 1
    )
    set "NODE_CMD=node"
)

"%NODE_CMD%" start-client.js

echo.
echo Client stopped.
pause
`, 'utf8');

  fs.writeFileSync(path.join(clientDir, 'stop-client.bat'), `@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if exist "data\\.pid" (
    set /p PID=<"data\\.pid"
    echo Stopping Budget App Web Client (PID: %PID%)...
    taskkill /pid %PID% /f /t >nul 2>nul
    del "data\\.pid" >nul 2>nul
    echo Stopped.
) else (
    echo No running client found.
)
pause
`, 'utf8');

  logSuccess(`Client package: ${clientDir}`);

  // --- FULL (COMBINED) PACKAGE ---
  const fullDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Full-${APP_VERSION}`);
  log('  Packaging full (server + client)...');

  if (fs.existsSync(fullDir)) {
    fs.rmSync(fullDir, { recursive: true, force: true });
  }
  fs.mkdirSync(fullDir, { recursive: true });

  if (fs.existsSync(nodeExeSrc)) {
    fs.copyFileSync(nodeExeSrc, path.join(fullDir, 'node.exe'));
  }
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, path.join(fullDir, 'icon.ico'));
  }

  copyDir(
    path.join(STANDALONE_DIR, 'api-server'),
    path.join(fullDir, 'api-server')
  );

  for (const f of nextFiles) {
    const src = path.join(STANDALONE_DIR, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(fullDir, f));
    }
  }
  for (const d of nextDirs) {
    const src = path.join(STANDALONE_DIR, d);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(fullDir, d));
    }
  }

  const fullPnpmDir = path.join(fullDir, 'node_modules', '.pnpm');
  if (fs.existsSync(fullPnpmDir)) {
    log('  Removing .pnpm (already merged to top-level)...');
    fs.rmSync(fullPnpmDir, { recursive: true, force: true });
  }

  log('  Stripping unnecessary platform binaries...');
  stripUnnecessaryModules(path.join(fullDir, 'node_modules'));

  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(fullDir, '.env.example'));
  }

  // Full startup script (shared generator — uses string concatenation, no template literals)
  fs.writeFileSync(path.join(fullDir, 'start.js'), generateFullStartJs(), 'utf8');

  fs.writeFileSync(path.join(fullDir, 'start.bat'), `@echo off
setlocal enabledelayedexpansion
title Budget App

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if not exist "data" mkdir data

if exist "node.exe" (
    set "NODE_CMD=%SCRIPT_DIR%node.exe"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Node.js not found!
        pause
        exit /b 1
    )
    set "NODE_CMD=node"
)

"%NODE_CMD%" start.js

echo.
echo Budget App stopped.
pause
`, 'utf8');

  fs.writeFileSync(path.join(fullDir, 'stop.bat'), `@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if exist "data\\.pid" (
    set /p PID=<"data\\.pid"
    echo Stopping Budget App (PID: %PID%)...
    taskkill /pid %PID% /f /t >nul 2>nul
    del "data\\.pid" >nul 2>nul
    echo Stopped.
) else (
    echo No running instance found.
)
pause
`, 'utf8');

  logSuccess(`Full package: ${fullDir}`);

  // --- Summary ---
  log('');
  log('Distribution packages:', colors.bright);

  const serverSize = getDirSize(serverDir);
  const clientSize = getDirSize(clientDir);
  const fullSize = getDirSize(fullDir);
  log(`  Server: ${(serverSize / 1024 / 1024).toFixed(1)} MB — ${serverDir}`);
  log(`  Client: ${(clientSize / 1024 / 1024).toFixed(1)} MB — ${clientDir}`);
  log(`  Full:   ${(fullSize / 1024 / 1024).toFixed(1)} MB — ${fullDir}`);

  log('');
  log('To test:', colors.bright);
  log('  Option A (combined): cd distribute\\BudgetApp-Full-' + APP_VERSION + ' && start.bat');
  log('  Option B (separate): Start server first, then client');
  log('  Open http://localhost:3400');
}

/**
 * Step 7: Create NSIS installers for server and client
 */
async function createInstallers() {
  logStep('7/7', 'Creating Windows installers...');

  if (skipInno) {
    logWarning('Skipping installer creation (--skip-inno flag)');
    return;
  }

  const makensisPath = findMakeNsis();
  if (!makensisPath) {
    logWarning('NSIS not found. Install from: https://nsis.sourceforge.io/Download');
    log('  Or run: winget install NSIS.NSIS');
    log('  Distribution packages are still available in distribute/');
    return;
  }

  log(`  Found NSIS: ${makensisPath}`);

  const iconFile = path.join(PROJECT_ROOT, 'public', 'icon.ico');
  const serverDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}`);
  const clientDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}`);

  log('  Building server installer...');
  buildNsisInstaller(makensisPath, {
    name: 'Budget App Server',
    sourceDir: serverDir,
    outputExe: `BudgetApp-Server-${APP_VERSION}-Setup.exe`,
    installDir: 'C:\\BudgetAppServer',
    regKey: 'BudgetAppServer',
    shortcutName: 'Budget App Server',
    launchFile: 'start-server.bat',
    iconFile,
    dataDirs: ['data'],
  });
  logSuccess(`Server installer: BudgetApp-Server-${APP_VERSION}-Setup.exe`);

  log('  Building client installer...');
  buildNsisInstaller(makensisPath, {
    name: 'Budget App Client',
    sourceDir: clientDir,
    outputExe: `BudgetApp-Client-${APP_VERSION}-Setup.exe`,
    installDir: 'C:\\BudgetAppClient',
    regKey: 'BudgetAppClient',
    shortcutName: 'Budget App',
    launchFile: 'start-client.bat',
    iconFile,
    dataDirs: [],
  });
  logSuccess(`Client installer: BudgetApp-Client-${APP_VERSION}-Setup.exe`);

  const fullDir = path.join(DISTRIBUTE_DIR, `BudgetApp-Full-${APP_VERSION}`);
  if (fs.existsSync(fullDir)) {
    log('  Building full installer...');
    buildNsisInstaller(makensisPath, {
      name: 'Budget App',
      sourceDir: fullDir,
      outputExe: `BudgetApp-Full-${APP_VERSION}-Setup.exe`,
      installDir: 'C:\\BudgetApp',
      regKey: 'BudgetApp',
      shortcutName: 'Budget App',
      launchFile: 'start.bat',
      iconFile,
      dataDirs: ['data'],
    });
    logSuccess(`Full installer: BudgetApp-Full-${APP_VERSION}-Setup.exe`);
  }
}

/**
 * Main build process
 */
async function main() {
  log('\n' + '='.repeat(50), colors.bright);
  log(`    Budget App Windows Build (v${APP_VERSION})`, colors.bright);
  log('='.repeat(50) + '\n', colors.bright);

  const startTime = Date.now();

  try {
    if (!skipBuild) {
      cleanDir(STANDALONE_DIR);
    }

    await buildNextJs();
    await bundleApiServer();
    await downloadNodeJs();
    await prepareStandalone();
    await verifyBuild();
    await createDistribution();
    await createInstallers();

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    log('\n' + '='.repeat(50), colors.green + colors.bright);
    log('       Build Complete!', colors.green + colors.bright);
    log('='.repeat(50), colors.green + colors.bright);
    log(`\n  Time elapsed: ${elapsed} seconds\n`);

    log('Output files:', colors.bright);
    log(`  Standalone:  ${STANDALONE_DIR}`);
    log(`  Server pkg:  ${path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}`)}`);
    log(`  Client pkg:  ${path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}`)}`);
    log(`  Full pkg:    ${path.join(DISTRIBUTE_DIR, `BudgetApp-Full-${APP_VERSION}`)}`);

    const serverInstaller = path.join(DISTRIBUTE_DIR, `BudgetApp-Server-${APP_VERSION}-Setup.exe`);
    const clientInstaller = path.join(DISTRIBUTE_DIR, `BudgetApp-Client-${APP_VERSION}-Setup.exe`);
    const fullInstaller = path.join(DISTRIBUTE_DIR, `BudgetApp-Full-${APP_VERSION}-Setup.exe`);
    if (fs.existsSync(serverInstaller)) {
      log(`  Server .exe: ${serverInstaller}`, colors.green);
    }
    if (fs.existsSync(clientInstaller)) {
      log(`  Client .exe: ${clientInstaller}`, colors.green);
    }
    if (fs.existsSync(fullInstaller)) {
      log(`  Full .exe:   ${fullInstaller}`, colors.green);
    }

    log('\nTo test locally:', colors.bright);
    log('  Option A (combined): cd distribute\\BudgetApp-Full-' + APP_VERSION + ' && start.bat');
    log('  Option B (separate): Start server first, then client');
    log('  Open http://localhost:3400\n');

  } catch (error) {
    logError(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

main();
