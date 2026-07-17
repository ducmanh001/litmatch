import { ADMIN_PERMISSION_KEY } from './admin.constants';
import { AdminController } from './admin.controller';

describe('AdminController permission coverage', () => {
  it('mọi route handler đều khai permission tường minh (deny-by-default)', () => {
    const methods = Object.getOwnPropertyNames(
      AdminController.prototype,
    ).filter((name) => name !== 'constructor');
    expect(methods.length).toBeGreaterThan(0);

    for (const method of methods) {
      const handler = Object.getOwnPropertyDescriptor(
        AdminController.prototype,
        method,
      )?.value as unknown;
      expect(Reflect.getMetadata(ADMIN_PERMISSION_KEY, handler)).toBeDefined();
    }
  });
});
