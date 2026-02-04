/**
 * Budget App Installer Build Script
 *
 * This script:
 * 1. Builds Next.js in standalone mode
 * 2. Downloads Node.js portable runtime (if not cached)
 * 3. Prepares the installer directory structure
 * 4. Optionally runs Inno Setup to create the installer
 *
 * Usage:
 *   node installer/build-installer.js [--skip-build] [--skip-inno]
 *
 * Prerequisites:
 *   - Node.js 20+ (for building)
 *   - Inno Setup 6+ (for creating installer, optional)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawn } = require('child_process');

// Configuration
const NODE_VERSION = '20.11.1'; // LTS version
const NODE_DOWNLOAD_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const STANDALONE_DIR = path.join(DIST_DIR, 'standalone');
const NODE_CACHE_DIR = path.join(DIST_DIR, 'node-cache');
const NODE_DIR = path.join(DIST_DIR, 'node');

// Parse command line arguments
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const skipInno = args.includes('--skip-inno');

// ANSI color codes for console output
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
 * Copy directory recursively
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Clean directory
 */
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Step 1: Build Next.js in standalone mode
 */
async function buildNextJs() {
  logStep('1/4', 'Building Next.js application...');

  if (skipBuild) {
    logWarning('Skipping build (--skip-build flag)');
    return;
  }

  // Clean previous build
  const nextDir = path.join(PROJECT_ROOT, '.next');
  if (fs.existsSync(nextDir)) {
    log('  Cleaning previous build...');
    fs.rmSync(nextDir, { recursive: true, force: true });
  }

  // Run Next.js build
  log('  Running next build...');
  execSync('npm run build', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  logSuccess('Next.js build complete');
}

/**
 * Step 2: Download Node.js portable runtime
 */
async function downloadNodeJs() {
  logStep('2/4', 'Preparing Node.js runtime...');

  const nodeExePath = path.join(NODE_DIR, 'node.exe');
  const cacheZipPath = path.join(NODE_CACHE_DIR, `node-v${NODE_VERSION}-win-x64.zip`);

  // Check if already cached
  if (fs.existsSync(nodeExePath)) {
    logSuccess(`Node.js ${NODE_VERSION} already available`);
    return;
  }

  fs.mkdirSync(NODE_CACHE_DIR, { recursive: true });
  fs.mkdirSync(NODE_DIR, { recursive: true });

  // Download if not cached
  if (!fs.existsSync(cacheZipPath)) {
    log(`  Downloading Node.js ${NODE_VERSION}...`);
    await downloadFile(NODE_DOWNLOAD_URL, cacheZipPath);
    logSuccess('Download complete');
  } else {
    logSuccess('Using cached Node.js download');
  }

  // Extract
  const tempExtractDir = path.join(DIST_DIR, 'node-extract');
  cleanDir(tempExtractDir);
  extractZip(cacheZipPath, tempExtractDir);

  // Find the extracted folder and copy node.exe
  const extractedFolder = fs.readdirSync(tempExtractDir)[0];
  const extractedNodeExe = path.join(tempExtractDir, extractedFolder, 'node.exe');

  if (fs.existsSync(extractedNodeExe)) {
    fs.copyFileSync(extractedNodeExe, nodeExePath);
    logSuccess(`Node.js ${NODE_VERSION} extracted`);
  } else {
    throw new Error('Could not find node.exe in extracted archive');
  }

  // Cleanup
  fs.rmSync(tempExtractDir, { recursive: true, force: true });
}

/**
 * Step 3: Prepare standalone directory
 */
async function prepareStandalone() {
  logStep('3/4', 'Preparing standalone package...');

  // Clean and create standalone directory
  cleanDir(STANDALONE_DIR);

  // Source paths from Next.js build
  const nextStandalone = path.join(PROJECT_ROOT, '.next', 'standalone');
  const nextStatic = path.join(PROJECT_ROOT, '.next', 'static');
  const publicDir = path.join(PROJECT_ROOT, 'public');

  // Check if standalone build exists
  if (!fs.existsSync(nextStandalone)) {
    throw new Error(
      'Next.js standalone build not found. Make sure next.config.ts has output: "standalone"'
    );
  }

  // Copy standalone server files
  log('  Copying standalone server files...');
  copyDir(nextStandalone, STANDALONE_DIR);

  // Copy static files to .next/static
  const destStatic = path.join(STANDALONE_DIR, '.next', 'static');
  if (fs.existsSync(nextStatic)) {
    log('  Copying static assets...');
    copyDir(nextStatic, destStatic);
  }

  // Copy public folder if it exists
  const destPublic = path.join(STANDALONE_DIR, 'public');
  if (fs.existsSync(publicDir)) {
    log('  Copying public assets...');
    copyDir(publicDir, destPublic);
  }

  // Copy .env.example as reference (user can create .env)
  const envExample = path.join(PROJECT_ROOT, '.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(STANDALONE_DIR, '.env.example'));
  }

  logSuccess('Standalone package prepared');
}

/**
 * Step 4: Run Inno Setup compiler
 */
async function runInnoSetup() {
  logStep('4/4', 'Creating Windows installer...');

  if (skipInno) {
    logWarning('Skipping Inno Setup (--skip-inno flag)');
    log('  To create installer manually, run Inno Setup on: installer/budget-app.iss');
    return;
  }

  // Find Inno Setup compiler
  const innoPaths = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 5\\ISCC.exe',
  ];

  let innoCompiler = null;
  for (const p of innoPaths) {
    if (fs.existsSync(p)) {
      innoCompiler = p;
      break;
    }
  }

  if (!innoCompiler) {
    logWarning('Inno Setup not found. Please install from: https://jrsoftware.org/isinfo.php');
    log('  After installing, run this script again or compile installer/budget-app.iss manually');
    return;
  }

  log(`  Found Inno Setup: ${innoCompiler}`);

  // Copy icon if it exists (or create a placeholder)
  const iconSrc = path.join(PROJECT_ROOT, 'public', 'icon.ico');
  const iconDest = path.join(STANDALONE_DIR, 'icon.ico');
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, iconDest);
  } else {
    // Create a simple placeholder note
    logWarning('No icon.ico found in public/ - installer will use default icon');
    logWarning('Add public/icon.ico for a custom application icon');
  }

  // Run Inno Setup compiler
  const issPath = path.join(__dirname, 'budget-app.iss');
  log('  Compiling installer...');

  try {
    execSync(`"${innoCompiler}" "${issPath}"`, {
      cwd: __dirname,
      stdio: 'inherit'
    });

    const installerPath = path.join(DIST_DIR, 'BudgetApp-1.7.0-Setup.exe');
    if (fs.existsSync(installerPath)) {
      logSuccess(`Installer created: ${installerPath}`);
    }
  } catch (error) {
    logError('Inno Setup compilation failed');
    throw error;
  }
}

/**
 * Main build process
 */
async function main() {
  log('\n' + '='.repeat(50), colors.bright);
  log('       Budget App Installer Build', colors.bright);
  log('='.repeat(50) + '\n', colors.bright);

  const startTime = Date.now();

  try {
    await buildNextJs();
    await downloadNodeJs();
    await prepareStandalone();
    await runInnoSetup();

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    log('\n' + '='.repeat(50), colors.green + colors.bright);
    log('       Build Complete!', colors.green + colors.bright);
    log('='.repeat(50), colors.green + colors.bright);
    log(`\n  Time elapsed: ${elapsed} seconds\n`);

    log('Output files:', colors.bright);
    log(`  Standalone:  ${STANDALONE_DIR}`);
    log(`  Node.js:     ${path.join(NODE_DIR, 'node.exe')}`);

    const installer = path.join(DIST_DIR, 'BudgetApp-1.7.0-Setup.exe');
    if (fs.existsSync(installer)) {
      log(`  Installer:   ${installer}`, colors.green);
    }

    log('\nTo test locally:', colors.bright);
    log('  1. cd dist/standalone');
    log('  2. ..\\node\\node.exe server.js');
    log('  3. Open http://localhost:3000\n');

  } catch (error) {
    logError(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

main();
