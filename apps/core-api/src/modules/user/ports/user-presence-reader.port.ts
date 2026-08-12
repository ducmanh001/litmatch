/** Presence is derived realtime state, never a business source of truth. */
export interface UserPresenceReaderPort {
  isOnline(userId: string): Promise<boolean>;
}
