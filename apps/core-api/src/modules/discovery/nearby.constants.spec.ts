import {
  computeDistanceBucket,
  haversineDistanceKm,
  nearbyJitterKm,
  quantizeCoordinate,
} from './nearby.constants';

describe('quantizeCoordinate', () => {
  it('làm tròn về lưới, không bao giờ giữ nguyên giá trị thô', () => {
    expect(quantizeCoordinate(10.6789123, 0.0045)).toBeCloseTo(10.678, 3);
  });

  it('cùng input luôn ra cùng output (deterministic)', () => {
    const a = quantizeCoordinate(10.762622, 0.0045);
    const b = quantizeCoordinate(10.762622, 0.0045);
    expect(a).toBe(b);
  });
});

describe('haversineDistanceKm', () => {
  it('khoảng cách 0 khi trùng toạ độ', () => {
    expect(haversineDistanceKm(10.7, 106.7, 10.7, 106.7)).toBeCloseTo(0, 5);
  });

  it('xấp xỉ đúng khoảng cách HN-HCM (~1140-1160km đường chim bay)', () => {
    // Hà Nội (21.0278, 105.8342) — TP.HCM (10.7626, 106.6602)
    const km = haversineDistanceKm(21.0278, 105.8342, 10.7626, 106.6602);
    expect(km).toBeGreaterThan(1100);
    expect(km).toBeLessThan(1200);
  });
});

describe('nearbyJitterKm', () => {
  it('deterministic theo (cặp, ngày) — cùng input luôn ra cùng jitter', () => {
    const a = nearbyJitterKm('user-a', 'user-b', '2026-07-14', 2);
    const b = nearbyJitterKm('user-a', 'user-b', '2026-07-14', 2);
    expect(a).toBe(b);
  });

  it('không phụ thuộc thứ tự tham số user (canonical pair)', () => {
    const ab = nearbyJitterKm('user-a', 'user-b', '2026-07-14', 2);
    const ba = nearbyJitterKm('user-b', 'user-a', '2026-07-14', 2);
    expect(ab).toBe(ba);
  });

  it('đổi ngày → jitter đổi (không cộng dồn suy luận nhiều ngày)', () => {
    const day1 = nearbyJitterKm('user-a', 'user-b', '2026-07-14', 2);
    const day2 = nearbyJitterKm('user-a', 'user-b', '2026-07-15', 2);
    expect(day1).not.toBe(day2);
  });

  it('luôn nằm trong [-maxJitterKm/2, +maxJitterKm/2]', () => {
    for (let i = 0; i < 20; i++) {
      const jitter = nearbyJitterKm(`u${i}`, `v${i}`, '2026-07-14', 4);
      expect(jitter).toBeGreaterThanOrEqual(-2);
      expect(jitter).toBeLessThanOrEqual(2);
    }
  });
});

describe('computeDistanceBucket', () => {
  const boundaries = '1,3,5,10,20';

  it('dưới mốc đầu tiên → "<1km"', () => {
    expect(computeDistanceBucket(0.5, boundaries)).toBe('<1km');
  });

  it('giữa 2 mốc → "a-bkm"', () => {
    expect(computeDistanceBucket(2, boundaries)).toBe('1-3km');
    expect(computeDistanceBucket(7, boundaries)).toBe('5-10km');
  });

  it('vượt mốc cuối → "20km+"', () => {
    expect(computeDistanceBucket(25, boundaries)).toBe('20km+');
  });

  it('không bao giờ trả về số km chính xác trong chuỗi kết quả', () => {
    const bucket = computeDistanceBucket(6.123456, boundaries);
    expect(bucket).not.toContain('6.123456');
  });
});
