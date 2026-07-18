import { HomeDashboard } from '../../../features/home/components/home-dashboard';
import { TrendingRoomCards } from '../../../features/party-room/components/trending-room-cards';

/** Route chỉ compose feature; Home không phụ thuộc ngược vào Party Room. */
export default function HomePage() {
  return <HomeDashboard trendingRooms={<TrendingRoomCards />} />;
}
