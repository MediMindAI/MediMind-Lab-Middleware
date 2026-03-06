# MediMind Lab Middleware — Setup Guide

This guide walks hospital IT through installing the middleware on the lab PC. It connects the Mindray BC-7600 analyzer to MediMind EMR through Medplum Cloud.

---

## What You Need

- **Windows 10/11** (the lab PC)
- **Node.js 20+** — download from https://nodejs.org (pick the LTS version)
- **Medplum client secret** — ask your MediMind admin for the secret key

---

## Step 1: Download

Go to the GitHub Releases page:

**https://github.com/MediMindAI/MediMind-Lab-Middleware/releases**

Download the latest `medimind-lab-middleware-vX.X.X-win-x64.zip`.

---

## Step 2: Extract

Extract the ZIP to:

```
C:\MediMind\lab-middleware\
```

You should see these files inside:

```
C:\MediMind\lab-middleware\
  ├── dist\              (compiled code)
  ├── node_modules\      (dependencies, pre-built for Windows)
  ├── config\            (analyzer settings)
  ├── scripts\           (Windows service installer)
  ├── data\              (offline queue — auto-created)
  ├── logs\              (log files — auto-created)
  ├── install.bat
  ├── uninstall.bat
  ├── .env.example
  ├── package.json
  └── SETUP.md           (this file)
```

---

## Step 3: Install

Right-click **`install.bat`** and select **"Run as Administrator"**.

The installer will:
1. Check that Node.js is installed
2. Install any remaining dependencies
3. Create `config\analyzers.json` (BC-7600 enabled by default)
4. Create `.env` from the template
5. Compile the code
6. Install the Windows Service

---

## Step 4: Paste the Medplum Secret

Open **`.env`** in Notepad and replace `PASTE_YOUR_SECRET_HERE` with your actual Medplum client secret:

```
MEDPLUM_CLIENT_SECRET=your-actual-secret-goes-here
```

Save the file. Then restart the service:

1. Open **services.msc** (Start > Run > `services.msc`)
2. Find **"MediMind Lab Middleware"**
3. Right-click > **Restart**

---

## Step 5: Configure LabXpert

On the PC running Mindray LabXpert software:

1. Open **LabXpert > Communication Settings**
2. Set **Channel: TcpClient**
3. Set **Remote IP** to the lab middleware PC's IP address (e.g., `192.168.1.50`)
4. Set **Remote Port** to `5001`
5. Save and restart LabXpert

---

## Step 6: Verify

Open a browser on the lab PC and go to:

**http://localhost:3001/health**

You should see a JSON response showing the service is running. When the BC-7600 sends results through LabXpert, they'll appear in MediMind EMR automatically.

---

## Checking Logs

Log files are in the `logs\` folder. If something isn't working:

```
type logs\lab-middleware-YYYY-MM-DD.log
```

Or open the file in Notepad. Set `LOG_LEVEL=debug` in `.env` for more detail (restart the service after).

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Node.js not installed"** | Download from https://nodejs.org (LTS version), then run install.bat again |
| **"Medplum auth fails"** | Double-check the client secret in `.env` |
| **No results from BC-7600** | Check LabXpert TcpClient settings — IP and port must match |
| **Results don't appear in EMR** | Check http://localhost:3001/health — is the service running? |
| **Service won't start** | Check `config\analyzers.json` for JSON syntax errors |
| **Queue growing but not sending** | Check internet connection, verify Medplum credentials |
| **Port 5001 blocked** | Check Windows Firewall — allow inbound TCP on port 5001 |

---

## Adding More Analyzers Later

The default config only has the BC-7600. To add more analyzers:

1. Open `config\analyzers.json`
2. Refer to `config\analyzers.template.json` for settings of all 11 supported analyzers
3. Copy the analyzer entry you need, set the COM port, and set `"enabled": true`
4. Restart the service

---

## Uninstalling

Right-click **`uninstall.bat`** and select **"Run as Administrator"**.

This removes the Windows Service. To fully remove, delete the `C:\MediMind\lab-middleware\` folder.

---

## Quick Reference

| What | Where |
|------|-------|
| Analyzer config | `config\analyzers.json` |
| Credentials | `.env` |
| Logs | `logs\` folder |
| Health check | http://localhost:3001/health |
| Analyzer status | http://localhost:3001/status |
| Message log | http://localhost:3001/messages |
| Windows Service name | "MediMind Lab Middleware" |
| LabXpert target port | 5001 |
