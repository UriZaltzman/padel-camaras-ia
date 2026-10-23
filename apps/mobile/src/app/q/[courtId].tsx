import { useLocalSearchParams } from 'expo-router';

import { shouldUseMockApi } from '../../auth/session';
import { CourtJoinScreen } from '../../court/CourtJoinScreen';
import type { CourtJoinService } from '../../court/court-join';
import { createMockCourtService } from '../../court/mock-court';

// Until the contract has the court lookup and join, only dev builds with EXPO_PUBLIC_API_MOCK=true
// get a (mock) service; release builds show "not available".
const service: CourtJoinService | undefined = shouldUseMockApi(
  process.env.EXPO_PUBLIC_API_MOCK,
  __DEV__,
)
  ? createMockCourtService()
  : undefined;

/** Target of the court QR: `<scheme>://q/{court_id}` (web fallback serves the same path). */
export default function CourtQrRoute() {
  const { courtId } = useLocalSearchParams<{ courtId: string }>();
  return <CourtJoinScreen courtId={courtId} service={service} />;
}
