import { useLocalSearchParams } from 'expo-router';

import { shouldUseMockApi } from '../../../auth/session';
import { createMockPartnerFinder } from '../../../tournaments/mock-tournaments';
import type { PartnerFinder } from '../../../tournaments/tournament-data';
import { TournamentDetailScreen } from '../../../tournaments/TournamentsScreen';

// The contract has no user search yet: only dev builds with EXPO_PUBLIC_API_MOCK=true get a
// (mock) partner finder; release builds show "not available" for the registration.
const finder: PartnerFinder | undefined = shouldUseMockApi(
  process.env.EXPO_PUBLIC_API_MOCK,
  __DEV__,
)
  ? createMockPartnerFinder()
  : undefined;

export default function TournamentRoute() {
  const { clubId, id } = useLocalSearchParams<{ clubId: string; id: string }>();
  return <TournamentDetailScreen clubId={clubId} tournamentId={id} finder={finder} />;
}
