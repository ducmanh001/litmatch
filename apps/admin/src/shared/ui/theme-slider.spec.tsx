import { fireEvent, render, screen } from '@testing-library/react';

import { themeStore } from '../lib/theme-store';
import { ThemeSlider } from './theme-slider';

describe('ThemeSlider', () => {
  beforeEach(() => {
    localStorage.clear();
    themeStore.set('cyan-dark');
  });

  it('mặc định Cyan Tối — active đúng option, không có class theme-warm/light trên <html>', () => {
    render(<ThemeSlider />);

    expect(screen.getByRole('radio', { name: 'Cyan Tối' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(document.documentElement.classList.contains('theme-warm')).toBe(
      false,
    );
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('bấm "Ấm Tối" — thêm class theme-warm, lưu localStorage', () => {
    render(<ThemeSlider />);

    fireEvent.click(screen.getByRole('radio', { name: 'Ấm Tối' }));

    expect(document.documentElement.classList.contains('theme-warm')).toBe(
      true,
    );
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(localStorage.getItem('litmatch-admin-theme')).toBe('warm-dark');
    expect(screen.getByRole('radio', { name: 'Ấm Tối' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('bấm "Cyan Sáng" rồi "Ấm Sáng" — cả 2 class cùng bật', () => {
    render(<ThemeSlider />);

    fireEvent.click(screen.getByRole('radio', { name: 'Cyan Sáng' }));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('theme-warm')).toBe(
      false,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Ấm Sáng' }));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('theme-warm')).toBe(
      true,
    );
    expect(localStorage.getItem('litmatch-admin-theme')).toBe('warm-light');
  });

  it('phím mũi tên phải — chuyển sang option kế tiếp', () => {
    render(<ThemeSlider />);

    const group = screen.getByRole('radiogroup');
    fireEvent.keyDown(group, { key: 'ArrowRight' });

    expect(screen.getByRole('radio', { name: 'Cyan Sáng' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
