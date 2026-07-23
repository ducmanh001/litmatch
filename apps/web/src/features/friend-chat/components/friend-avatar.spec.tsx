import { render, screen } from '@testing-library/react';

import { FriendAvatar } from './friend-avatar';

// describe('FriendAvatar', () => {
// it('dùng nickname làm alt text', () => {
//   render(<FriendAvatar userId="u1" nickname="mưa" />);
//   expect(screen.getByAltText('mưa')).toBeInTheDocument();
// });
// it('src deterministic theo userId (cùng id luôn ra cùng ảnh)', () => {
//   const { container: a } = render(<FriendAvatar userId="u1" nickname="A" />);
//   const { container: b } = render(<FriendAvatar userId="u1" nickname="B" />);
//   expect(a.querySelector('img')?.src).toBe(b.querySelector('img')?.src);
// });
// it('userId khác nhau ra src khác nhau', () => {
//   const { container: a } = render(<FriendAvatar userId="u1" nickname="A" />);
//   const { container: b } = render(<FriendAvatar userId="u2" nickname="A" />);
//   expect(a.querySelector('img')?.src).not.toBe(b.querySelector('img')?.src);
// });
// });
