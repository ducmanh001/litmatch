import { createTokenStore, memoryCsrfTokenStorage } from './token-store';

describe('TokenStore session lifecycle', () => {
  it('chưa từng đăng nhập (không có csrfToken persisted) → unauthenticated ngay', () => {
    const store = createTokenStore(memoryCsrfTokenStorage());
    expect(store.getStatus()).toBe('unauthenticated');
    expect(store.getAccessToken()).toBeNull();
  });

  it('có csrfToken persisted từ trước (reload) → restorable, không phải unauthenticated', () => {
    const storage = memoryCsrfTokenStorage();
    storage.set('csrf-old');
    const store = createTokenStore(storage);
    expect(store.getStatus()).toBe('restorable');
    expect(store.getCsrfToken()).toBe('csrf-old'); // seed lại được để gửi kèm lần refresh đầu
    expect(store.getAccessToken()).toBeNull(); // access token KHÔNG persist qua reload
  });

  it('setSession → authenticated, persist csrfToken (không phải accessToken)', () => {
    const storage = memoryCsrfTokenStorage();
    const store = createTokenStore(storage);

    store.setSession({ accessToken: 'access', csrfToken: 'csrf-new' });

    expect(store.getStatus()).toBe('authenticated');
    expect(store.getAccessToken()).toBe('access');
    expect(storage.get()).toBe('csrf-new');
  });

  it('setSession(null) → unauthenticated, xoá persisted csrfToken', () => {
    const storage = memoryCsrfTokenStorage();
    const store = createTokenStore(storage);
    store.setSession({ accessToken: 'access', csrfToken: 'csrf' });

    store.setSession(null);

    expect(store.getStatus()).toBe('unauthenticated');
    expect(store.getAccessToken()).toBeNull();
    expect(store.getCsrfToken()).toBeNull();
    expect(storage.get()).toBeNull();
  });

  it('không commit response async nếu generation đã đổi (race logout-rồi-refresh-cũ)', () => {
    const store = createTokenStore(memoryCsrfTokenStorage());
    store.setSession({ accessToken: 'old', csrfToken: 'csrf-old' });
    const expectedGeneration = store.getGeneration();

    store.setSession(null);
    const committed = store.setSessionIfCurrent(
      { accessToken: 'late', csrfToken: 'csrf-late' },
      expectedGeneration,
    );

    expect(committed).toBe(false);
    expect(store.getStatus()).toBe('unauthenticated');
  });

  it('tab khác rotate csrfToken → cập nhật giá trị, KHÔNG đổi status hiện tại', () => {
    let listener: ((value: string | null) => void) | undefined;
    const storage = {
      get: () => 'csrf-old',
      set: () => undefined,
      subscribe: (l: (value: string | null) => void) => {
        listener = l;
        return () => undefined;
      },
    };
    const store = createTokenStore(storage);
    store.setSession({ accessToken: 'access', csrfToken: 'csrf-old' });

    listener?.('csrf-rotated-by-other-tab');

    expect(store.getCsrfToken()).toBe('csrf-rotated-by-other-tab');
    expect(store.getStatus()).toBe('authenticated'); // không bị đổi
    expect(store.getAccessToken()).toBe('access'); // không bị đổi
  });

  it('tab khác login khi tab này đang unauthenticated → chuyển restorable', () => {
    let listener: ((value: string | null) => void) | undefined;
    const storage = {
      get: () => null,
      set: () => undefined,
      subscribe: (l: (value: string | null) => void) => {
        listener = l;
        return () => undefined;
      },
    };
    const store = createTokenStore(storage);
    expect(store.getStatus()).toBe('unauthenticated');

    listener?.('csrf-from-other-tab');

    expect(store.getStatus()).toBe('restorable');
    expect(store.getCsrfToken()).toBe('csrf-from-other-tab');
  });

  it('tab khác logout (storage value bị xoá) → unauthenticated ngay, không cần tự 401', () => {
    let listener: ((value: string | null) => void) | undefined;
    const storage = {
      get: () => 'csrf-old',
      set: () => undefined,
      subscribe: (l: (value: string | null) => void) => {
        listener = l;
        return () => undefined;
      },
    };
    const store = createTokenStore(storage);
    store.setSession({ accessToken: 'access', csrfToken: 'csrf-old' });

    listener?.(null);

    expect(store.getStatus()).toBe('unauthenticated');
    expect(store.getAccessToken()).toBeNull();
    expect(store.getCsrfToken()).toBeNull();
  });
});
