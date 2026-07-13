import {
  hasLivekitRegionUrls,
  parseLivekitRegionUrls,
  resolveLivekitUrl,
} from './livekit-url';

const DEFAULT_URL = 'ws://media-server.litmatch.svc.cluster.local:7880';
const MAP = JSON.stringify({
  SEA: 'wss://sea.livekit.example',
  EU: 'wss://eu.livekit.example',
});

describe('parseLivekitRegionUrls', () => {
  it('chuỗi rỗng/whitespace = multi-region tắt → map rỗng', () => {
    expect(parseLivekitRegionUrls('')).toEqual({});
    expect(parseLivekitRegionUrls('  ')).toEqual({});
  });

  it('parse map hợp lệ', () => {
    expect(parseLivekitRegionUrls(MAP)).toEqual({
      SEA: 'wss://sea.livekit.example',
      EU: 'wss://eu.livekit.example',
    });
  });

  it('JSON hỏng → throw message có tên biến (chết lúc boot, không vỡ lúc join)', () => {
    expect(() => parseLivekitRegionUrls('{oops')).toThrow(
      /LIVEKIT_REGION_URLS/,
    );
  });

  it('không phải object map → throw', () => {
    expect(() => parseLivekitRegionUrls('["wss://a"]')).toThrow(
      /LIVEKIT_REGION_URLS/,
    );
    expect(() => parseLivekitRegionUrls('"wss://a"')).toThrow(
      /LIVEKIT_REGION_URLS/,
    );
  });

  it('URL không phải ws/wss (http, số, rỗng) → throw kèm region sai', () => {
    expect(() =>
      parseLivekitRegionUrls('{"SEA":"https://sea.example"}'),
    ).toThrow(/SEA/);
    expect(() => parseLivekitRegionUrls('{"SEA":123}')).toThrow(/SEA/);
    expect(() => parseLivekitRegionUrls('{"SEA":""}')).toThrow(/SEA/);
  });

  it('key region rỗng → throw', () => {
    expect(() => parseLivekitRegionUrls('{"":"wss://a.example"}')).toThrow(
      /region rỗng/,
    );
  });
});

describe('resolveLivekitUrl', () => {
  it('region có trong map → URL của region đó', () => {
    expect(resolveLivekitUrl(MAP, DEFAULT_URL, 'SEA')).toBe(
      'wss://sea.livekit.example',
    );
  });

  it('region không có trong map → fallback LIVEKIT_URL', () => {
    expect(resolveLivekitUrl(MAP, DEFAULT_URL, 'NA')).toBe(DEFAULT_URL);
  });

  it('region null/undefined (User.region chưa set) → fallback LIVEKIT_URL', () => {
    expect(resolveLivekitUrl(MAP, DEFAULT_URL, null)).toBe(DEFAULT_URL);
    expect(resolveLivekitUrl(MAP, DEFAULT_URL, undefined)).toBe(DEFAULT_URL);
  });

  it('backward compat: chỉ set LIVEKIT_URL (map rỗng) → luôn trả LIVEKIT_URL, y hệt trước', () => {
    expect(resolveLivekitUrl('', DEFAULT_URL, 'SEA')).toBe(DEFAULT_URL);
    expect(resolveLivekitUrl('', DEFAULT_URL, null)).toBe(DEFAULT_URL);
  });
});

describe('hasLivekitRegionUrls', () => {
  it('rỗng/"{}" → false; có entry → true', () => {
    expect(hasLivekitRegionUrls('')).toBe(false);
    expect(hasLivekitRegionUrls('{}')).toBe(false);
    expect(hasLivekitRegionUrls(MAP)).toBe(true);
  });
});
