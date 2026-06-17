// Manual bootstrap download (no WinRM needed). Run via RDP once per Windows box.
const express = require('express');
const asyncHandler = require('express-async-handler');
const miner = require('../services/miner');
const { getSetting } = require('../db');

const router = express.Router();

// GET /api/bootstrap/windows.ps1  -> standalone install PowerShell script
// Run on each Windows box via RDP (as Administrator):
//   powershell -ExecutionPolicy Bypass -File c3pool-install.ps1
router.get('/windows.ps1', asyncHandler(async (req, res) => {
  try {
    const { ps1 } = miner.buildWinBootstrap();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="c3pool-install.ps1"');
    res.send(ps1);
  } catch (e) {
    res.status(400).send('# ' + e.message);
  }
}));

// GET /api/bootstrap/winrm-setup.cmd -> enable WinRM on target (run once per box)
router.get('/winrm-setup.cmd', (req, res) => {
  const body = `@echo off\r
REM Enable WinRM + AllowUnencrypted so the manager can push remotely.\r
REM Run as Administrator on each Windows machine.\r
echo Enabling WinRM...\r
winrm quickconfig -force\r
winrm set winrm/config/service "@{AllowUnencrypted=\\"true\\"}"\r
winrm set winrm/config/client "@{AllowUnencrypted=\\"true\\"}"\r
winrm set winrm/config/service/Auth "@{Basic=\\"true\\"}"\r
sc config WinRM start= auto\r
sc start WinRM\r
netsh advfirewall firewall set rule name="Windows Remote Management (HTTP-In)" new enable=yes\r
echo Done. This machine is now manageable by the C3Pool manager.\r
pause\r
`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="enable-winrm.cmd"');
  res.send(body);
});

module.exports = router;
