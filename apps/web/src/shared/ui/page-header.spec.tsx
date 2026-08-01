import { render, screen } from '@testing-library/react';

import { HeaderEyebrow } from './page-header';

describe('HeaderEyebrow', () => {
  it('dùng token theme chung cho nền, viền và text', () => {
    render(<HeaderEyebrow>Hẹn hò có chủ đích</HeaderEyebrow>);

    const heading = screen.getByText('Hẹn hò có chủ đích');
    expect(heading).toHaveStyle({
      background: 'var(--eyebrow-bg)',
      color: 'var(--eyebrow-text)',
    });
    expect(heading).toHaveClass('border');
  });
});
