import { fireEvent, render, screen } from '@testing-library/react';

import { setLocale } from '../i18n/locale-store';
import { LanguageSelector } from './language-selector';

describe('LanguageSelector', () => {
  afterEach(() => setLocale('vi'));

  it('chọn English, cập nhật locale cho request kế tiếp và giữ preference bằng cookie', () => {
    setLocale('vi');
    render(<LanguageSelector />);

    fireEvent.click(screen.getByRole('button', { name: /chọn ngôn ngữ/i }));
    fireEvent.click(screen.getByRole('option', { name: 'English' }));

    expect(screen.getByRole('button', { name: /English/i })).toHaveTextContent(
      'EN',
    );
    expect(document.documentElement.lang).toBe('en');
    expect(document.cookie).toContain('litmatch-web.locale=en');
  });
});
