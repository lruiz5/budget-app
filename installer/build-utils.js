/**
 * Shared build utilities for Budget App installer scripts.
 * Used by build-installer.js and build-cross-platform.js.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '..');
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version;
const NODE_VERSION = '20.11.1'; // LTS version
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const STANDALONE_DIR = path.join(DIST_DIR, 'standalone');
const NODE_CACHE_DIR = path.join(DIST_DIR, 'node-cache');
const DISTRIBUTE_DIR = path.join(PROJECT_ROOT, 'distribute');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, colors.cyan + colors.bright);
}

function logSuccess(message) {
  log(`  ✓ ${message}`, colors.green);
}

function logWarning(message) {
  log(`  ! ${message}`, colors.yellow);
}

function logError(message) {
  log(`  ✗ ${message}`, colors.red);
}

/**
 * Download a file from URL to destination
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const percent = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
        process.stdout.write(`\r  Downloading: ${percent}% (${Math.round(downloadedBytes / 1024 / 1024)}MB)`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(''); // New line after progress
        resolve();
      });
    });

    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/**
 * Extract zip file (Windows-specific using PowerShell)
 */
function extractZip(zipPath, destDir) {
  log(`  Extracting to ${destDir}...`);
  execSync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
    { stdio: 'inherit' }
  );
}

/**
 * Extract tarball (.tar.gz) file.
 * Uses system tar which is available on Windows 10+, Linux, and macOS.
 */
function extractTarball(tarPath, destDir) {
  log(`  Extracting to ${destDir}...`);
  fs.mkdirSync(destDir, { recursive: true });
  execSync(`tar xzf "${tarPath}" -C "${destDir}"`, { stdio: 'inherit' });
}

/**
 * Create a .tar.gz archive from a directory.
 * Uses system tar which is available on Windows 10+, Linux, and macOS.
 */
function createTarGz(sourceDir, outputPath) {
  const parentDir = path.dirname(sourceDir);
  const dirName = path.basename(sourceDir);
  log(`  Creating ${path.basename(outputPath)}...`);
  execSync(`tar czf "${outputPath}" -C "${parentDir}" "${dirName}"`, { stdio: 'inherit' });
}

/**
 * Platform-specific configuration for Node.js downloads and build targets.
 */
const PLATFORM_CONFIG = {
  win32: {
    nodeFilename: (ver) => `node-v${ver}-win-x64.zip`,
    nodeUrl: (ver) => `https://nodejs.org/dist/v${ver}/node-v${ver}-win-x64.zip`,
    nodeBinary: 'node.exe',
    extract: extractZip,
    archiveSuffix: 'win-x64',
    sharpKeep: ['sharp-win32-x64', 'colour'],
  },
  linux: {
    nodeFilename: (ver) => `node-v${ver}-linux-x64.tar.gz`,
    nodeUrl: (ver) => `https://nodejs.org/dist/v${ver}/node-v${ver}-linux-x64.tar.gz`,
    nodeBinary: 'node',
    extract: extractTarball,
    archiveSuffix: 'linux-x64',
    sharpKeep: ['sharp-linux-x64', 'colour'],
  },
  darwin: {
    nodeFilename: (ver) => `node-v${ver}-darwin-x64.tar.gz`,
    nodeUrl: (ver) => `https://nodejs.org/dist/v${ver}/node-v${ver}-darwin-x64.tar.gz`,
    nodeBinary: 'node',
    extract: extractTarball,
    archiveSuffix: 'darwin-x64',
    sharpKeep: ['sharp-darwin-x64', 'colour'],
  },
};

/**
 * Copy directory recursively (handles pnpm symlinks)
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    try {
      // Resolve symlinks to get the real path
      const realPath = fs.realpathSync(srcPath);
      const stat = fs.statSync(realPath);

      if (stat.isDirectory()) {
        copyDir(realPath, destPath);
      } else {
        fs.copyFileSync(realPath, destPath);
      }
    } catch (err) {
      // Skip files that can't be copied (broken symlinks, permission issues)
      // This is expected for platform-specific binaries (e.g., darwin on Windows)
      if (err.code === 'EPERM' || err.code === 'ENOENT') {
        continue;
      }
      throw err;
    }
  }
}

/**
 * Clean directory (remove and recreate)
 */
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Calculate total size of a directory recursively.
 */
function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          total += getDirSize(fullPath);
        } else {
          total += fs.statSync(fullPath).size;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return total;
}

/**
 * Strip unnecessary platform binaries and dev-only packages from node_modules.
 *
 * @param {string} nodeModulesDir - Path to node_modules directory
 * @param {string[]} [sharpKeep] - @img/sharp-* prefixes to keep (default: Windows)
 */
function stripUnnecessaryModules(nodeModulesDir, sharpKeep) {
  if (!fs.existsSync(nodeModulesDir)) return;

  sharpKeep = sharpKeep || ['sharp-win32-x64', 'colour'];
  let savedBytes = 0;

  // 1. Remove non-target-platform @img/sharp-* packages
  const imgDir = path.join(nodeModulesDir, '@img');
  if (fs.existsSync(imgDir)) {
    const entries = fs.readdirSync(imgDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (sharpKeep.some(p => entry.name.startsWith(p))) continue;
      const dirPath = path.join(imgDir, entry.name);
      const size = getDirSize(dirPath);
      fs.rmSync(dirPath, { recursive: true, force: true });
      savedBytes += size;
    }
  }

  // 2. Remove dev-only packages not needed at runtime
  const devOnlyPackages = ['typescript'];
  for (const pkg of devOnlyPackages) {
    const pkgDir = path.join(nodeModulesDir, pkg);
    if (fs.existsSync(pkgDir)) {
      const size = getDirSize(pkgDir);
      fs.rmSync(pkgDir, { recursive: true, force: true });
      savedBytes += size;
    }
  }

  if (savedBytes > 0) {
    logSuccess(`Stripped ${(savedBytes / 1024 / 1024).toFixed(1)} MB of unnecessary platform/dev packages`);
  }
}

/**
 * Fix pnpm's split node_modules layout.
 *
 * pnpm stores actual package files in .pnpm/<pkg>@<version>/node_modules/<pkg>/
 * and creates symlinks/junctions at the top level. Next.js standalone tracing
 * copies the .pnpm structure but top-level entries may be incomplete (only
 * package.json without actual code files). This function merges files from
 * .pnpm/ into the top-level entries so the app works without pnpm resolution.
 */
function fixPnpmLayout(nodeModulesDir) {
  const pnpmDir = path.join(nodeModulesDir, '.pnpm');
  if (!fs.existsSync(pnpmDir)) return;

  const pnpmEntries = fs.readdirSync(pnpmDir, { withFileTypes: true });
  let fixed = 0;

  for (const entry of pnpmEntries) {
    if (!entry.isDirectory()) continue;

    const innerModules = path.join(pnpmDir, entry.name, 'node_modules');
    if (!fs.existsSync(innerModules)) continue;

    const pkgEntries = fs.readdirSync(innerModules, { withFileTypes: true });
    for (const pkgEntry of pkgEntries) {
      if (!pkgEntry.isDirectory()) continue;

      let pkgName = pkgEntry.name;
      let srcPkgDir = path.join(innerModules, pkgName);

      if (pkgName.startsWith('@')) {
        const scopeEntries = fs.readdirSync(srcPkgDir, { withFileTypes: true });
        for (const scopeEntry of scopeEntries) {
          if (!scopeEntry.isDirectory()) continue;
          const scopedSrc = path.join(srcPkgDir, scopeEntry.name);
          const scopedDest = path.join(nodeModulesDir, pkgName, scopeEntry.name);
          if (mergePackageDir(scopedSrc, scopedDest)) fixed++;
        }
      } else {
        const destPkgDir = path.join(nodeModulesDir, pkgName);
        if (mergePackageDir(srcPkgDir, destPkgDir)) fixed++;
      }
    }
  }

  if (fixed > 0) {
    logSuccess(`Fixed ${fixed} incomplete package(s) from .pnpm`);
  }
}

/**
 * Merge files from src into dest, only copying files that don't exist in dest.
 */
function mergePackageDir(src, dest) {
  if (!fs.existsSync(src)) return false;

  if (!fs.existsSync(dest)) {
    try {
      copyDir(src, dest);
      return true;
    } catch {
      return false;
    }
  }

  let added = false;
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    try {
      if (!fs.existsSync(destPath)) {
        const realPath = fs.realpathSync(srcPath);
        const stat = fs.statSync(realPath);

        if (stat.isDirectory()) {
          copyDir(realPath, destPath);
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(realPath, destPath);
        }
        added = true;
      } else if (entry.isDirectory()) {
        if (mergePackageDir(srcPath, destPath)) added = true;
      }
    } catch {
      continue;
    }
  }

  return added;
}

/**
 * Find NSIS makensis.exe compiler
 */
function findMakeNsis() {
  const locations = [
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe',
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) return loc;
  }

  try {
    const result = execSync('where makensis', { encoding: 'utf8' }).trim().split('\n')[0];
    if (result && fs.existsSync(result)) return result;
  } catch { /* not in PATH */ }

  return null;
}

/**
 * Build an NSIS installer from a source directory.
 */
function buildNsisInstaller(makensisPath, opts) {
  const tempDir = path.join(DIST_DIR, 'nsis-temp');
  cleanDir(tempDir);

  copyDir(opts.sourceDir, path.join(tempDir, 'files'));

  let iconDirective = '';
  let unIconDirective = '';
  if (opts.iconFile && fs.existsSync(opts.iconFile)) {
    const iconDest = path.join(tempDir, 'icon.ico');
    fs.copyFileSync(opts.iconFile, iconDest);
    iconDirective = `!define MUI_ICON "${iconDest.replace(/\\/g, '\\\\')}"`;
    unIconDirective = `!define MUI_UNICON "${iconDest.replace(/\\/g, '\\\\')}"`;
  }

  const dataDirChecks = (opts.dataDirs || []).map(d =>
    `  RMDir /r "$INSTDIR\\${d}"`
  ).join('\n');

  const uninstallRemove = (opts.dataDirs && opts.dataDirs.length > 0)
    ? `  ; Ask user about data preservation
  MessageBox MB_YESNO "Do you want to keep your budget data?$\\r$\\n$\\r$\\nClick Yes to keep your data (you can use it if you reinstall).$\\r$\\nClick No to delete all data." IDYES SkipDataDelete
${dataDirChecks}
  SkipDataDelete:`
    : '';

  const nsisScript = `
; NSIS Installer Script for ${opts.name}
; Generated by build scripts

!include "MUI2.nsh"

; General
Name "${opts.name} ${APP_VERSION}"
OutFile "${path.join(DISTRIBUTE_DIR, opts.outputExe).replace(/\\/g, '\\\\')}"
InstallDir "${opts.installDir}"
InstallDirRegKey HKCU "Software\\${opts.regKey}" "InstallDir"
RequestExecutionLevel user

; Interface Settings
!define MUI_ABORTWARNING
${iconDirective}
${unIconDirective}

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; Installer Section
Section "Install"
  SetOutPath "$INSTDIR"

  ; Copy all files
  File /r "${path.join(tempDir, 'files', '*.*').replace(/\\/g, '\\\\')}"

  ; Store installation folder
  WriteRegStr HKCU "Software\\${opts.regKey}" "InstallDir" "$INSTDIR"

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\\Uninstall.exe"

  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\\${opts.shortcutName}"
  CreateShortcut "$SMPROGRAMS\\${opts.shortcutName}\\${opts.shortcutName}.lnk" "$INSTDIR\\${opts.launchFile}" "" "$INSTDIR\\icon.ico"
  CreateShortcut "$SMPROGRAMS\\${opts.shortcutName}\\Uninstall.lnk" "$INSTDIR\\Uninstall.exe"

  ; Create Desktop shortcut
  CreateShortcut "$DESKTOP\\${opts.shortcutName}.lnk" "$INSTDIR\\${opts.launchFile}" "" "$INSTDIR\\icon.ico"

SectionEnd

; Uninstaller Section
Section "Uninstall"
${uninstallRemove}

  ; Remove all files
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$SMPROGRAMS\\${opts.shortcutName}\\${opts.shortcutName}.lnk"
  Delete "$SMPROGRAMS\\${opts.shortcutName}\\Uninstall.lnk"
  RMDir "$SMPROGRAMS\\${opts.shortcutName}"
  Delete "$DESKTOP\\${opts.shortcutName}.lnk"

  ; Remove registry keys
  DeleteRegKey HKCU "Software\\${opts.regKey}"

SectionEnd
`;

  const nsisScriptPath = path.join(tempDir, 'installer.nsi');
  fs.writeFileSync(nsisScriptPath, nsisScript, 'utf8');

  execSync(`"${makensisPath}" "${nsisScriptPath}"`, { stdio: 'inherit' });

  fs.rmSync(tempDir, { recursive: true, force: true });
}

// =============================================================================
// Startup Script Generators
// =============================================================================
// These generate platform-safe JS startup scripts. They deliberately use
// var / function / string-concatenation (no template literals, no const/let,
// no arrow functions) so the output runs on any Node >= 12 and avoids
// the backtick-escaping pitfall that breaks when scripts are written from
// inside a template literal string.

/**
 * Generate a platform-aware Node.js startup script for the Server package.
 */
function generateServerStartJs() {
  return `#!/usr/bin/env node
/**
 * Budget App API Server - Standalone Startup
 * Starts the Hono API server with PGlite local database.
 */
var spawn = require('child_process').spawn;
var path = require('path');
var fs = require('fs');

var APP_DIR = __dirname;
var DEFAULT_API_PORT = 3401;
var isWindows = process.platform === 'win32';

function readEnvVar(name, defaultValue) {
  var envPath = path.join(APP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    var content = fs.readFileSync(envPath, 'utf8');
    var match = content.match(new RegExp('^' + name + '=(.+)', 'm'));
    if (match) return match[1].trim();
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

function writePidFile() {
  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.pid'), process.pid.toString(), 'utf8');
}

function removePidFile() {
  try { fs.unlinkSync(path.join(APP_DIR, 'data', '.pid')); } catch (e) {}
}

function killChild(child) {
  if (!child) return;
  if (isWindows) {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch (e) {}
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (e) {}
  }
}

function main() {
  var apiPort = parseInt(readEnvVar('API_PORT', String(DEFAULT_API_PORT)), 10);

  console.log('');
  console.log('========================================');
  console.log('     Budget App API Server');
  console.log('========================================');
  console.log('');
  console.log('  API server:  http://localhost:' + apiPort);
  console.log('  Health:      http://localhost:' + apiPort + '/health');
  console.log('  Data:        ' + path.join(APP_DIR, 'data', 'budget-local'));
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  writePidFile();

  var serverEntry = path.join(APP_DIR, 'api-server', 'index.mjs');
  if (!fs.existsSync(serverEntry)) {
    console.error('API server not found at ' + serverEntry);
    process.exit(1);
  }

  var child = spawn(process.execPath, [serverEntry], {
    cwd: path.join(APP_DIR, 'api-server'),
    stdio: 'inherit',
    detached: !isWindows,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production',
      API_PORT: apiPort.toString(),
      PGLITE_DB_LOCATION: path.join(APP_DIR, 'data', 'budget-local'),
    }),
  });

  child.on('close', function (code) {
    removePidFile();
    process.exit(code || 0);
  });

  function shutdown() {
    killChild(child);
    removePidFile();
    setTimeout(function () { process.exit(0); }, 1000);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
`;
}

/**
 * Generate a platform-aware Node.js startup script for the Client package.
 */
function generateClientStartJs() {
  return `#!/usr/bin/env node
/**
 * Budget App Web Client - Standalone Startup
 * Starts the Next.js web server.
 */
var spawn = require('child_process').spawn;
var execSync = require('child_process').execSync;
var path = require('path');
var fs = require('fs');

var APP_DIR = __dirname;
var DEFAULT_WEB_PORT = 3400;
var DEFAULT_API_PORT = 3401;
var isWindows = process.platform === 'win32';

function readEnvVar(name, defaultValue) {
  var envPath = path.join(APP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    var content = fs.readFileSync(envPath, 'utf8');
    var match = content.match(new RegExp('^' + name + '=(.+)', 'm'));
    if (match) return match[1].trim();
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

function writePidFile() {
  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.pid'), process.pid.toString(), 'utf8');
}

function removePidFile() {
  try { fs.unlinkSync(path.join(APP_DIR, 'data', '.pid')); } catch (e) {}
}

function killChild(child) {
  if (!child) return;
  if (isWindows) {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch (e) {}
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (e) {}
  }
}

function openBrowser(url) {
  try {
    if (isWindows) {
      execSync('start "" "' + url + '"', { stdio: 'ignore', shell: true });
    } else if (process.platform === 'darwin') {
      execSync('open "' + url + '"', { stdio: 'ignore' });
    } else {
      execSync('xdg-open "' + url + '"', { stdio: 'ignore' });
    }
  } catch (e) {
    console.log('Open your browser to: ' + url);
  }
}

function main() {
  var webPort = parseInt(readEnvVar('SERVER_PORT', String(DEFAULT_WEB_PORT)), 10);
  var apiPort = parseInt(readEnvVar('API_PORT', String(DEFAULT_API_PORT)), 10);

  console.log('');
  console.log('========================================');
  console.log('     Budget App Web Client');
  console.log('========================================');
  console.log('');
  console.log('  Web app:     http://localhost:' + webPort);
  console.log('  API server:  http://localhost:' + apiPort + ' (must be running separately)');
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  var serverEntry = path.join(APP_DIR, 'server.js');
  if (!fs.existsSync(serverEntry)) {
    console.error('Next.js server not found at ' + serverEntry);
    process.exit(1);
  }

  writePidFile();

  var child = spawn(process.execPath, [serverEntry], {
    cwd: APP_DIR,
    stdio: 'inherit',
    detached: !isWindows,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production',
      PORT: webPort.toString(),
      HOSTNAME: '0.0.0.0',
    }),
  });

  setTimeout(function () { openBrowser('http://localhost:' + webPort); }, 2000);

  child.on('close', function (code) {
    removePidFile();
    process.exit(code || 0);
  });

  function shutdown() {
    killChild(child);
    removePidFile();
    setTimeout(function () { process.exit(0); }, 1000);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
`;
}

/**
 * Generate a platform-aware Node.js startup script for the Full (combined) package.
 */
function generateFullStartJs() {
  return `#!/usr/bin/env node
/**
 * Budget App - Combined Startup
 * Starts the Hono API server, waits for health, then starts the Next.js web client.
 */
var spawn = require('child_process').spawn;
var execSync = require('child_process').execSync;
var path = require('path');
var fs = require('fs');
var http = require('http');

var APP_DIR = __dirname;
var DEFAULT_WEB_PORT = 3400;
var DEFAULT_API_PORT = 3401;
var isWindows = process.platform === 'win32';

var API_PREFIX = '\\x1b[36m[API]\\x1b[0m';
var WEB_PREFIX = '\\x1b[35m[WEB]\\x1b[0m';

function readEnvVar(name, defaultValue) {
  var envPath = path.join(APP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    var content = fs.readFileSync(envPath, 'utf8');
    var match = content.match(new RegExp('^' + name + '=(.+)', 'm'));
    if (match) return match[1].trim();
  }
  if (process.env[name]) return process.env[name];
  return defaultValue;
}

function writePidFile() {
  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.pid'), process.pid.toString(), 'utf8');
}

function removePidFile() {
  try { fs.unlinkSync(path.join(APP_DIR, 'data', '.pid')); } catch (e) {}
}

function killChild(child) {
  if (!child) return;
  if (isWindows) {
    try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' }); } catch (e) {}
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (e) {}
  }
}

function openBrowser(url) {
  try {
    if (isWindows) {
      execSync('start "" "' + url + '"', { stdio: 'ignore', shell: true });
    } else if (process.platform === 'darwin') {
      execSync('open "' + url + '"', { stdio: 'ignore' });
    } else {
      execSync('xdg-open "' + url + '"', { stdio: 'ignore' });
    }
  } catch (e) {
    console.log('Open your browser to: ' + url);
  }
}

function waitForHealth(port, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  var start = Date.now();
  var interval = 500;

  return new Promise(function (resolve, reject) {
    function check() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('API server health check timed out after ' + timeoutMs + 'ms'));
        return;
      }

      var req = http.get('http://localhost:' + port + '/health', function (res) {
        if (res.statusCode === 200) {
          console.log(API_PREFIX + ' Health check passed');
          resolve(true);
        } else {
          setTimeout(check, interval);
        }
      });

      req.on('error', function () {
        setTimeout(check, interval);
      });

      req.setTimeout(2000, function () {
        req.destroy();
        setTimeout(check, interval);
      });
    }

    check();
  });
}

var apiChild = null;
var webChild = null;
var shuttingDown = false;

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = exitCode || 0;

  console.log('');
  console.log('Shutting down...');

  killChild(webChild);
  killChild(apiChild);

  removePidFile();
  setTimeout(function () { process.exit(exitCode); }, 1000);
}

async function main() {
  var webPort = parseInt(readEnvVar('SERVER_PORT', String(DEFAULT_WEB_PORT)), 10);
  var apiPort = parseInt(readEnvVar('API_PORT', String(DEFAULT_API_PORT)), 10);

  console.log('');
  console.log('========================================');
  console.log('           Budget App');
  console.log('========================================');
  console.log('');
  console.log('  Web app:     http://localhost:' + webPort);
  console.log('  API server:  http://localhost:' + apiPort);
  console.log('  Data:        ' + path.join(APP_DIR, 'data', 'budget-local'));
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  var dataDir = path.join(APP_DIR, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  writePidFile();

  // 1. Start API server
  var serverEntry = path.join(APP_DIR, 'api-server', 'index.mjs');
  if (!fs.existsSync(serverEntry)) {
    console.error('API server not found at ' + serverEntry);
    process.exit(1);
  }

  console.log(API_PREFIX + ' Starting API server...');
  apiChild = spawn(process.execPath, [serverEntry], {
    cwd: path.join(APP_DIR, 'api-server'),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production',
      API_PORT: apiPort.toString(),
      PGLITE_DB_LOCATION: path.join(APP_DIR, 'data', 'budget-local'),
    }),
  });

  apiChild.stdout.on('data', function (data) {
    var lines = data.toString().split('\\n').filter(Boolean);
    for (var i = 0; i < lines.length; i++) console.log(API_PREFIX + ' ' + lines[i]);
  });
  apiChild.stderr.on('data', function (data) {
    var lines = data.toString().split('\\n').filter(Boolean);
    for (var i = 0; i < lines.length; i++) console.error(API_PREFIX + ' ' + lines[i]);
  });
  apiChild.on('close', function (code) {
    apiChild = null;
    if (!shuttingDown) {
      console.error(API_PREFIX + ' API server exited with code ' + code);
      shutdown(code || 1);
    }
  });

  // 2. Wait for health check
  try {
    await waitForHealth(apiPort);
  } catch (err) {
    console.error('Failed to start API server: ' + err.message);
    shutdown(1);
    return;
  }

  // 3. Start Next.js web client
  var clientEntry = path.join(APP_DIR, 'server.js');
  if (!fs.existsSync(clientEntry)) {
    console.error('Next.js server not found at ' + clientEntry);
    shutdown(1);
    return;
  }

  console.log(WEB_PREFIX + ' Starting web client...');
  webChild = spawn(process.execPath, [clientEntry], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production',
      PORT: webPort.toString(),
      HOSTNAME: '0.0.0.0',
    }),
  });

  webChild.stdout.on('data', function (data) {
    var lines = data.toString().split('\\n').filter(Boolean);
    for (var i = 0; i < lines.length; i++) console.log(WEB_PREFIX + ' ' + lines[i]);
  });
  webChild.stderr.on('data', function (data) {
    var lines = data.toString().split('\\n').filter(Boolean);
    for (var i = 0; i < lines.length; i++) console.error(WEB_PREFIX + ' ' + lines[i]);
  });
  webChild.on('close', function (code) {
    webChild = null;
    if (!shuttingDown) {
      console.log(WEB_PREFIX + ' Web client exited with code ' + code);
      shutdown(code || 1);
    }
  });

  // 4. Open browser after short delay
  setTimeout(function () { openBrowser('http://localhost:' + webPort); }, 2500);
}

process.on('SIGINT', function () { shutdown(0); });
process.on('SIGTERM', function () { shutdown(0); });

main();
`;
}

/**
 * Generate platform-specific shell scripts (bash).
 */
function generateStartSh(jsFile) {
  return `#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p data

if [ -x "$SCRIPT_DIR/node" ]; then
    NODE_CMD="$SCRIPT_DIR/node"
elif command -v node &>/dev/null; then
    NODE_CMD="node"
else
    echo "ERROR: Node.js not found!"
    exit 1
fi

"$NODE_CMD" ${jsFile}
`;
}

function generateStopSh(serviceName) {
  return `#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f "data/.pid" ]; then
    PID=$(cat data/.pid)
    echo "Stopping ${serviceName} (PID: $PID)..."
    kill -TERM "$PID" 2>/dev/null
    sleep 2
    kill -9 "$PID" 2>/dev/null
    rm -f data/.pid
    echo "Stopped."
else
    echo "No running instance found."
fi
`;
}

function generateInstallSh() {
  return `#!/bin/bash
# Sets executable permissions on scripts and the bundled Node.js binary.
# Run this once after extracting the archive:  chmod +x install.sh && ./install.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

chmod +x node *.sh 2>/dev/null
echo "Permissions set. Run ./start.sh (or ./start-server.sh / ./start-client.sh) to launch Budget App."
`;
}

module.exports = {
  // Constants
  APP_VERSION,
  NODE_VERSION,
  PROJECT_ROOT,
  DIST_DIR,
  STANDALONE_DIR,
  NODE_CACHE_DIR,
  DISTRIBUTE_DIR,
  PLATFORM_CONFIG,
  colors,

  // Logging
  log,
  logStep,
  logSuccess,
  logWarning,
  logError,

  // File operations
  downloadFile,
  extractZip,
  extractTarball,
  createTarGz,
  copyDir,
  cleanDir,
  getDirSize,
  stripUnnecessaryModules,
  fixPnpmLayout,
  mergePackageDir,

  // Installer tools
  findMakeNsis,
  buildNsisInstaller,

  // Startup script generators
  generateServerStartJs,
  generateClientStartJs,
  generateFullStartJs,
  generateStartSh,
  generateStopSh,
  generateInstallSh,
};
