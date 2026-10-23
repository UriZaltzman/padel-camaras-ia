import { useRouter } from 'expo-router';

import { HomeScreen } from '../home/HomeScreen';
import { mockNextBooking } from '../home/mock-home';
import { shouldUseMockApi } from '../auth/session';

// The next booking is mocked only in dev builds with EXPO_PUBLIC_API_MOCK=true.
const loadNextBooking = shouldUseMockApi(process.env.EXPO_PUBLIC_API_MOCK, __DEV__)
  ? () => Promise.resolve(mockNextBooking())
  : undefined;

export default function HomeRoute() {
  const router = useRouter();
  return (
    <HomeScreen
      loadNextBooking={loadNextBooking}
      onOpenTournaments={(clubId) => router.push(`/tournaments/${clubId}`)}
    />
  );
}
