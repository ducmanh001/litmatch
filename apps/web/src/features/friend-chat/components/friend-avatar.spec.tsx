import { render, screen } from '@testing-library/react';

import { FriendAvatar, hashToHue } from './friend-avatar';

describe('hashToHue', () => {
  it('deterministic — cùng id luôn ra cùng hue', () => {
    expect(hashToHue('user-1')).toBe(hashToHue('user-1'));
  });

  it('nằm trong khoảng 0-359', () => {
    expect(hashToHue('user-1')).toBeGreaterThanOrEqual(0);
    expect(hashToHue('user-1')).toBeLessThan(360);
    expect(hashToHue('')).toBeGreaterThanOrEqual(0);
  });

  it('id khác nhau thường ra hue khác nhau', () => {
    expect(hashToHue('user-1')).not.toBe(hashToHue('user-2'));
  });
});

describe('FriendAvatar', () => {
  it('hiển thị chữ cái đầu viết hoa của nickname', () => {
    render(<FriendAvatar userId="u1" nickname="mưa" />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });
});
