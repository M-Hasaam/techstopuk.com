#!/usr/bin/env node
const { execSync } = require('node:child_process');

const ports = process.argv.slice(2)
  .map((a) => a.replace(/^-+/, '')) // allow "-3002" or "3002"
  .filter((a) => /^\d+$/.test(a));

if (ports.length === 0) {
  console.error('Usage: npm run kill -- <port> [port...]   e.g. npm run kill -- 3002 3003');
  process.exit(1);
}

function killPortWindows(port) {
  let out;
  try {
    out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
  } catch {
    console.log(`Port ${port}: nothing listening.`);
    return;
  }

  const pids = new Set();
  for (const line of out.split('\n')) {
    const match = line.trim().match(/LISTENING\s+(\d+)\s*$/);
    if (match) pids.add(match[1]);
  }

  if (pids.size === 0) {
    console.log(`Port ${port}: nothing listening.`);
    return;
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`Port ${port}: killed PID ${pid}.`);
    } catch {
      console.log(`Port ${port}: failed to kill PID ${pid} (already gone?).`);
    }
  }
}

function killPortUnix(port) {
  try {
    execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((pid) => {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        console.log(`Port ${port}: killed PID ${pid}.`);
      });
  } catch {
    console.log(`Port ${port}: nothing listening.`);
  }
}

for (const port of ports) {
  if (process.platform === 'win32') killPortWindows(port);
  else killPortUnix(port);
}
