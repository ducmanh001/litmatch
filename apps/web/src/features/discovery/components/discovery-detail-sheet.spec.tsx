import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { DiscoveryDetailSheet } from './discovery-detail-sheet';

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Mở hồ sơ Chi
      </button>
      {open && (
        <DiscoveryDetailSheet
          card={{
            profile: {
              id: 'user-1',
              nickname: 'Chi',
              gender: 'female',
              avatarId: null,
            },
            ageBucket: '25-30',
          }}
          onClose={() => setOpen(false)}
          onInvite={vi.fn()}
          inviteId={undefined}
          isInviting={false}
          inviteError={undefined}
          invitedMatchType={undefined}
        />
      )}
    </>
  );
}

describe('DiscoveryDetailSheet', () => {
  it('trap focus, inert nền và trả focus về thẻ mở khi đóng', async () => {
    render(<DialogHarness />);
    const user = userEvent.setup();
    const opener = screen.getByRole('button', { name: 'Mở hồ sơ Chi' });

    await user.click(opener);
    const close = screen.getByRole('button', { name: 'Đóng hồ sơ' });
    const voice = screen.getByRole('button', { name: 'Mời Voice Match' });
    expect(close).toHaveFocus();
    expect(opener).toHaveAttribute('inert');
    expect(opener).toHaveAttribute('aria-hidden', 'true');

    voice.focus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(voice).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).not.toHaveAttribute('inert');
    expect(opener).not.toHaveAttribute('aria-hidden');
    expect(opener).toHaveFocus();
  });
});
