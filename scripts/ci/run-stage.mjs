#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
const label = process.env['LITMATCH_STAGE_LABEL'] ?? command ?? 'unknown';
const timeoutMs = Number(process.env['LITMATCH_STAGE_TIMEOUT_MS']);
const killGraceMs = Number(
  process.env['LITMATCH_STAGE_KILL_GRACE_MS'] ?? '5000',
);

if (
  !command ||
  !Number.isSafeInteger(timeoutMs) ||
  timeoutMs <= 0 ||
  !Number.isSafeInteger(killGraceMs) ||
  killGraceMs <= 0
) {
  console.error(
    '[stage-runner] Command, positive LITMATCH_STAGE_TIMEOUT_MS and kill grace are required.',
  );
  process.exit(2);
}

const startedAt = Date.now();
const child = spawn(command, args, {
  detached: process.platform !== 'win32',
  stdio: 'inherit',
});
let timedOut = false;
let forwardedSignal;
let killTimer;
let terminationFinished;

function signalTree(signal) {
  try {
    if (process.platform === 'win32') {
      const taskkillArgs = ['/pid', String(child.pid), '/t'];
      if (signal === 'SIGKILL') taskkillArgs.push('/f');
      spawnSync('taskkill', taskkillArgs, { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function terminateTree(reason, signal = 'SIGTERM') {
  if (terminationFinished) return terminationFinished;

  console.error(
    `[stage-runner] ${reason}: ${label}; elapsed=${Date.now() - startedAt}ms; signal=${signal}`,
  );
  signalTree(signal);
  terminationFinished = new Promise((resolve) => {
    killTimer = setTimeout(() => {
      console.error(
        `[stage-runner] HARD_KILL: ${label}; grace=${killGraceMs}ms; signal=SIGKILL`,
      );
      signalTree('SIGKILL');
      resolve();
    }, killGraceMs);
  });
  return terminationFinished;
}

const timeout = setTimeout(() => {
  timedOut = true;
  terminateTree(`TIMED_OUT after ${timeoutMs}ms`);
}, timeoutMs);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (forwardedSignal) return;
    forwardedSignal = signal;
    terminateTree('CANCELLED by parent', signal);
  });
}

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }));
  child.once('exit', (code, signal) => resolve({ code, signal }));
});

clearTimeout(timeout);
if (terminationFinished) await terminationFinished;
else clearTimeout(killTimer);

if (result.error) {
  console.error(
    `[stage-runner] SPAWN_FAILED: ${label}; ${result.error.message}`,
  );
  process.exitCode = 127;
} else if (timedOut) {
  process.exitCode = 124;
} else if (forwardedSignal) {
  process.exitCode = forwardedSignal === 'SIGINT' ? 130 : 143;
} else if (result.signal) {
  console.error(
    `[stage-runner] SIGNALED: ${label}; signal=${result.signal}; elapsed=${Date.now() - startedAt}ms`,
  );
  process.exitCode = 1;
} else {
  process.exitCode = result.code ?? 1;
}
