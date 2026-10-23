import { useLocalSearchParams, useRouter } from 'expo-router';

import { FindSlotScreen } from '../booking/FindSlotScreen';

export default function BookScreen() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId?: string }>();
  return <FindSlotScreen initialClubId={clubId} onBooked={() => router.replace('/')} />;
}
