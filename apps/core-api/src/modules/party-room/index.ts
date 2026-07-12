/**
 * Public API của Party Room module — module khác CHỈ import từ đây.
 * Gift dùng getActiveRoomMembers để validate người tặng/nhận cùng phòng active
 * + lấy danh sách member cho realtime fanout (docs/services/gift-service.md).
 */
export { PartyRoomModule } from './party-room.module';
export { PartyRoomService } from './party-room.service';
export {
  PartyRoom,
  PartyRoomStatus,
  PartyRoomCloseReason,
} from './entities/party-room.entity';
export {
  PartyRole,
  PartyRoomMember,
} from './entities/party-room-member.entity';
export { PartyRoomErrors } from './party-room.errors';
