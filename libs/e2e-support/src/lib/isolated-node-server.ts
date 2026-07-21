import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface IsolatedNodeServerState {
  host: string;
  logFile: string;
  pid: number;
  port: number;
}

export interface StartIsolatedNodeServerOptions {
  entrypoint: string;
  environment?: NodeJS.ProcessEnv;
  host?: string;
  name: string;
  portEnvironmentVariable?: string;
  startupTimeoutMs?: number;
  workspaceRoot: string;
}

function assertSafeName(name: string): void {
  if (!/^[a-z0-9-]+$/u.test(name)) {
    throw new Error(`Tên isolated server không hợp lệ: ${name}`);
  }
}

function stateFile(name: string): string {
  assertSafeName(name);
  return join(
    tmpdir(),
    `litmatch-${name}-e2e-${process.getuid?.() ?? 'unknown'}.json`,
  );
}

async function findAvailablePort(host: string): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Không thể cấp cổng tạm cho E2E server.'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolveOpen) => {
    const socket = createConnection({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolveOpen(true);
    });
    socket.once('error', () => resolveOpen(false));
    socket.setTimeout(250, () => {
      socket.destroy();
      resolveOpen(false);
    });
  });
}

async function waitForPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`E2E server không mở ${host}:${port} sau ${timeoutMs}ms.`);
}

function terminateProcessGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error;
    }
  }
}

export async function startIsolatedNodeServer(
  options: StartIsolatedNodeServerOptions,
): Promise<IsolatedNodeServerState> {
  assertSafeName(options.name);
  const host = options.host ?? '127.0.0.1';
  const port = await findAvailablePort(host);
  const logFile = join(tmpdir(), `litmatch-${options.name}-e2e-${port}.log`);
  const logDescriptor = openSync(logFile, 'w');
  const portEnvironmentVariable = options.portEnvironmentVariable ?? 'PORT';
  const server = spawn(
    process.execPath,
    [resolve(options.workspaceRoot, options.entrypoint)],
    {
      cwd: options.workspaceRoot,
      detached: true,
      env: {
        ...process.env,
        ...options.environment,
        HOST: host,
        [portEnvironmentVariable]: String(port),
      },
      stdio: ['ignore', logDescriptor, logDescriptor],
    },
  );
  closeSync(logDescriptor);

  if (!server.pid) {
    throw new Error(`Không thể khởi động ${options.name} cho E2E.`);
  }

  server.unref();
  const state: IsolatedNodeServerState = {
    host,
    logFile,
    pid: server.pid,
    port,
  };
  writeFileSync(stateFile(options.name), JSON.stringify(state), 'utf8');

  try {
    await waitForPort(host, port, options.startupTimeoutMs ?? 30_000);
    return state;
  } catch (error) {
    terminateProcessGroup(state.pid);
    unlinkSync(stateFile(options.name));
    const serverLog = readFileSync(logFile, 'utf8');
    throw new Error(
      `${options.name} E2E khởi động thất bại. Log:\n${serverLog}`,
      {
        cause: error,
      },
    );
  }
}

export function readIsolatedNodeServerState(
  name: string,
): IsolatedNodeServerState {
  return JSON.parse(
    readFileSync(stateFile(name), 'utf8'),
  ) as IsolatedNodeServerState;
}

export function stopIsolatedNodeServer(name: string): void {
  const path = stateFile(name);
  if (!existsSync(path)) {
    return;
  }

  const state = JSON.parse(
    readFileSync(path, 'utf8'),
  ) as IsolatedNodeServerState;
  try {
    terminateProcessGroup(state.pid);
  } finally {
    unlinkSync(path);
  }
}
