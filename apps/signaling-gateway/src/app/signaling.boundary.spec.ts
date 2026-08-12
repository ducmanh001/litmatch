import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SOURCE_ROOT = resolve(__dirname);

describe('Signaling transport boundary', () => {
  it('gateway source không import LiveKit/ORM/core business module', () => {
    const sourceFiles = readdirSync(SOURCE_ROOT, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => join(entry.parentPath, entry.name));
    const forbiddenImport =
      /(?:from|require\s*\()\s*['"][^'"]*(?:livekit-server-sdk|typeorm|apps\/core-api\/src\/modules)[^'"]*['"]/;

    expect(
      sourceFiles.filter((file) =>
        forbiddenImport.test(readFileSync(file, 'utf8')),
      ),
    ).toEqual([]);
  });

  it('SignalingGateway chỉ expose transport ping handler, không có business command handler', () => {
    const source = readFileSync(
      join(SOURCE_ROOT, 'signaling.gateway.ts'),
      'utf8',
    );
    expect(source.match(/@SubscribeMessage\(/g)).toEqual([
      '@SubscribeMessage(',
    ]);
    expect(source).toContain("@SubscribeMessage('ping')");
  });
});
