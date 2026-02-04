# Budget App Windows Installer

This directory contains everything needed to create a self-contained Windows installer for Budget App.

## What Gets Installed

The installer creates a standalone Budget App server that:
- Runs without requiring users to install Node.js
- Stores data locally using PGlite (SQLite-compatible PostgreSQL)
- Serves the app at `http://localhost:3000`
- Can optionally start with Windows

## Prerequisites (For Building)

1. **Node.js 20+** - For building the app
2. **Inno Setup 6+** - For creating the installer (optional)
   - Download from: https://jrsoftware.org/isinfo.php

## Building the Installer

### Quick Start

```bash
# Full build: Next.js build + download Node.js + create installer
npm run build:installer
```

### Other Build Options

```bash
# Skip Next.js build (if you already ran npm run build)
npm run build:installer:quick

# Create standalone package without Inno Setup installer
npm run build:standalone
```

### Manual Build Steps

If you prefer to build step by step:

1. **Build Next.js in standalone mode:**
   ```bash
   npm run build
   ```

2. **Run the build script:**
   ```bash
   node installer/build-installer.js
   ```

3. **Or compile installer manually with Inno Setup:**
   - Open `installer/budget-app.iss` in Inno Setup
   - Click "Compile" or press F9

## Output Files

After building, you'll find:

```
dist/
├── standalone/          # Self-contained Next.js server
│   ├── server.js       # Main entry point
│   ├── .next/          # Compiled app
│   └── public/         # Static assets
├── node/
│   └── node.exe        # Portable Node.js runtime
└── BudgetApp-x.x.x-Setup.exe  # Windows installer (if Inno Setup installed)
```

## Testing Locally

Before creating the installer, test the standalone build:

```bash
cd dist/standalone
..\node\node.exe server.js
```

Then open http://localhost:3000 in your browser.

## Installer Features

- **Desktop shortcut** (optional)
- **Start menu entries** - Start/Stop Budget App, Uninstall
- **Auto-start with Windows** (optional)
- **Data preservation** - Asks to keep data on uninstall
- **Port conflict detection** - Warns if port 3000 is in use

## User Experience

After installation, users:

1. Double-click "Budget App" shortcut
2. Server starts and browser opens automatically
3. Use the app at `http://localhost:3000`
4. Data is stored in `%PROGRAMFILES%\Budget App\data\`

## Customization

### Change App Icon

Place a 256x256 ICO file at `public/icon.ico` before building.

### Change Port

Edit `installer/start.bat` and change `set "PORT=3000"` to your preferred port.

### Change Install Location

The Inno Setup script (`budget-app.iss`) defaults to `%PROGRAMFILES%\Budget App`. Users can change this during installation.

## Troubleshooting

### "Port 3000 already in use"

Another application is using port 3000. Either:
- Stop the other application
- Edit `start.bat` to use a different port

### "Node.js not found"

The `node.exe` file is missing. Re-run the build script or ensure the installer was created correctly.

### Server crashes immediately

Check the console output for errors. Common issues:
- Missing `.env` file (copy from `.env.example` if needed)
- Database initialization failure (check `data/` directory permissions)

## Files in This Directory

| File | Purpose |
|------|---------|
| `build-installer.js` | Node.js script that orchestrates the build process |
| `budget-app.iss` | Inno Setup script for creating the Windows installer |
| `start.bat` | Windows batch file to start the server |
| `stop.bat` | Windows batch file to stop the server |
| `README.md` | This file |
