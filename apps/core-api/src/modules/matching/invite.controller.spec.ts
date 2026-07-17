import { InviteController } from './invite.controller';
import { MatchInvite, MatchInviteStatus } from './entities/match-invite.entity';
import { MatchType } from './entities/match-ticket.entity';
import { Gender, User, UserStatus } from '../user';

import type { InviteService } from './services/invite.service';
import type { UserService } from '../user';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const invitee: AuthenticatedUser = {
  userId: '00000000-0000-4000-8000-000000000002',
  isGuest: false,
  role: 'user',
};

function invite(): MatchInvite {
  return Object.assign(new MatchInvite(), {
    id: '00000000-0000-4000-8000-000000000003',
    inviterUserId: '00000000-0000-4000-8000-000000000001',
    inviteeUserId: invitee.userId,
    matchType: MatchType.Soul,
    status: MatchInviteStatus.Pending,
    expiresAt: new Date('2026-07-15T01:00:00Z'),
    sessionId: null,
    createdAt: new Date('2026-07-15T00:00:00Z'),
  });
}

function inviter(): User {
  return Object.assign(new User(), {
    id: '00000000-0000-4000-8000-000000000001',
    nickname: 'An Nhiên',
    gender: Gender.Female,
    avatarId: 'avatar-public',
    birthDate: '1998-01-02',
    region: 'VN-HN',
    trustScore: 87,
    status: UserStatus.Active,
  });
}

describe('InviteController — informed-consent DTO', () => {
  const inviteService = {
    listReceivedInvites: jest.fn(),
  };
  const userService = {
    findByIds: jest.fn(),
  };
  let controller: InviteController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InviteController(
      inviteService as unknown as InviteService,
      userService as unknown as UserService,
    );
  });

  it('incoming invite có inviterProfile công khai đủ để quyết định, không lộ dữ liệu private', async () => {
    inviteService.listReceivedInvites.mockResolvedValue({
      items: [invite()],
      meta: { nextCursor: null },
    });
    userService.findByIds.mockResolvedValue([inviter()]);

    const result = await controller.listReceived(invitee, { limit: 20 });

    expect(userService.findByIds).toHaveBeenCalledWith([
      '00000000-0000-4000-8000-000000000001',
    ]);
    expect(result.items[0]?.inviterProfile).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      nickname: 'An Nhiên',
      gender: Gender.Female,
      avatarId: 'avatar-public',
    });
    expect(result.items[0]?.inviterProfile).not.toHaveProperty('birthDate');
    expect(result.items[0]?.inviterProfile).not.toHaveProperty('region');
    expect(result.items[0]?.inviterProfile).not.toHaveProperty('trustScore');
    expect(result.items[0]?.inviterProfile).not.toHaveProperty('status');
  });
});
