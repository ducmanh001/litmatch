import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setLocale } from '../../../shared/i18n/locale-store';
import { MoreView } from './more-view';

const logoutMock = vi.fn();
const currentUserMock = vi.fn();

vi.mock('../../../shared/auth/use-current-user', () => ({
  useCurrentUser: () => currentUserMock(),
}));

vi.mock('../../../shared/auth/use-logout', () => ({
  useLogout: () => logoutMock,
}));

vi.mock('../../../shared/ui/icons', () => ({
  ChevronRightIcon: () => createElement('span'),
  CrownIcon: () => createElement('span'),
  DiscoveryIcon: () => createElement('span'),
  FeedIcon: () => createElement('span'),
  HelpCircleIcon: () => createElement('span'),
  PartyIcon: () => createElement('span'),
  ProfileIcon: () => createElement('span'),
  ShareIcon: () => createElement('span'),
  ShieldIcon: () => createElement('span'),
  VideoIcon: () => createElement('span'),
}));

vi.mock('../../../shared/ui/page-header', () => ({
  BrandMark: () => createElement('span', null, 'Litmatch'),
  PageHeader: ({ leading }: { leading?: ReactNode }) =>
    createElement('div', { 'data-testid': 'page-header' }, leading),
}));

vi.mock('../../../shared/ui/language-selector', () => ({
  LanguageSelector: () => createElement('span', null, 'Language'),
}));

vi.mock('../../../shared/ui/placeholder-avatar', () => ({
  PlaceholderAvatar: () => createElement('span', null, 'Avatar'),
}));

vi.mock('../../../shared/ui/theme-toggle-button', () => ({
  ThemeToggleButton: () => createElement('button', null, 'Theme'),
}));

describe('MoreView', () => {
  beforeEach(() => {
    currentUserMock.mockReturnValue({
      data: {
        id: 'u1',
        nickname: '  ',
      },
    });
  });

  afterEach(() => {
    cleanup();
    setLocale('vi');
    logoutMock.mockReset();
    currentUserMock.mockReset();
    vi.restoreAllMocks();
    delete (navigator as Navigator & { share?: typeof navigator.share }).share;
  });

  it('English — localizes the page copy and share prompt', async () => {
    setLocale('en');
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });

    render(createElement(MoreView));

    expect(await screen.findByText('User')).toBeTruthy();
    expect(screen.getByText('View and edit your profile')).toBeTruthy();
    expect(screen.getByText('Upgrade to Premium')).toBeTruthy();
    expect(screen.getByText('Explore')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: 'Invite friends' }),
    );

    const url = window.location.origin;
    expect(share).toHaveBeenCalledWith({
      title: 'Litmatch',
      text: `Join Litmatch with me: ${url}`,
      url,
    });
  });
});
