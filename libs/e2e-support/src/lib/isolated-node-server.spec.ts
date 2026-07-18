import { resolve } from 'node:path';
import {
  readIsolatedNodeServerState,
  startIsolatedNodeServer,
  stopIsolatedNodeServer,
} from './isolated-node-server';

const serverName = `fixture-${process.pid}`;

afterEach(() => {
  stopIsolatedNodeServer(serverName);
});

it('khởi động trên port ngẫu nhiên, đọc state dùng chung và dừng đúng process', async () => {
  const workspaceRoot = resolve(__dirname, '../../../..');
  const state = await startIsolatedNodeServer({
    name: serverName,
    workspaceRoot,
    entrypoint: 'libs/e2e-support/src/test-fixtures/http-server.cjs',
  });

  await expect(
    fetch(`http://${state.host}:${state.port}`).then((response) =>
      response.text(),
    ),
  ).resolves.toBe('ready');
  expect(readIsolatedNodeServerState(serverName)).toEqual(state);

  stopIsolatedNodeServer(serverName);
  expect(() => readIsolatedNodeServerState(serverName)).toThrow();
});

it('từ chối tên có thể thoát khỏi thư mục temp', () => {
  expect(() => stopIsolatedNodeServer('../unsafe')).toThrow(
    'Tên isolated server không hợp lệ',
  );
});
