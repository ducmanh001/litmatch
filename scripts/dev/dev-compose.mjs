import { execFileSync } from 'node:child_process';

const DEV_COMPOSE_ARGS = [
  'compose',
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.dev.yml',
];

export function readDevServiceLogs(service, tail = 100) {
  if (!Number.isSafeInteger(tail) || tail < 1) {
    throw new Error(`Số dòng log không hợp lệ: ${tail}`);
  }

  return execFileSync(
    'docker',
    [...DEV_COMPOSE_ARGS, 'logs', `--tail=${tail}`, service],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
    },
  );
}
