import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const CORE_SRC = resolve(__dirname, '..');

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts'),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

function livekitSdkImports(file: string): boolean {
  return /(?:from|require\s*\()\s*['"]livekit-server-sdk['"]/.test(
    readFileSync(file, 'utf8'),
  );
}

describe('LiveKit provider boundary', () => {
  it('calling/party-room production code does not import LiveKit SDK directly', () => {
    const modules = [
      join(CORE_SRC, 'modules', 'calling'),
      join(CORE_SRC, 'modules', 'party-room'),
    ];
    const violations = modules
      .flatMap((directory) => productionFiles(directory))
      .filter(livekitSdkImports)
      .map((file) => relative(CORE_SRC, file));

    expect(violations).toEqual([]);
  });

  it('SDK import có đúng một owner infrastructure dùng chung', () => {
    const sdkOwners = productionFiles(CORE_SRC).filter(livekitSdkImports);

    expect(sdkOwners).toEqual([
      join(CORE_SRC, 'common', 'livekit', 'livekit-sdk.client.ts'),
    ]);
  });

  it('port chỉ chứa contract, không chứa SDK client class', () => {
    const portFiles = [
      join(CORE_SRC, 'modules', 'calling', 'ports', 'livekit-room.ts'),
      join(CORE_SRC, 'modules', 'party-room', 'ports', 'livekit-party-room.ts'),
    ];
    const forbiddenProviderTypes =
      /AccessToken|RoomServiceClient|WebhookReceiver/;

    expect(
      portFiles.filter((file) =>
        forbiddenProviderTypes.test(readFileSync(file, 'utf8')),
      ),
    ).toEqual([]);
  });
});
