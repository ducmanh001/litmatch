export interface RefreshSessionIssue {
  tokenHash: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshSessionRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  rotatedAt: Date | null;
}

export interface RefreshSessionRotationInput {
  tokenId: string;
  replacement: Pick<RefreshSessionIssue, 'tokenHash' | 'expiresAt'>;
}

/** Persistence boundary cho refresh session; implementation cụ thể không leak ra TokenService. */
export abstract class RefreshSessionPort {
  abstract issue(input: RefreshSessionIssue): Promise<void>;
  abstract findByTokenHash(
    tokenHash: string,
  ): Promise<RefreshSessionRecord | null>;
  abstract rotate(
    input: RefreshSessionRotationInput,
  ): Promise<'rotated' | 'invalid' | 'reused'>;
  abstract revoke(tokenHash: string): Promise<void>;
  abstract revokeForUser(userId: string): Promise<void>;
  abstract revokeFamily(familyId: string): Promise<void>;
}
