// Notification preferences live on the device until the contract has a server-side field.
import * as SecureStore from 'expo-secure-store';

const REMINDERS_KEY = 'pref.booking_reminders';

export interface PreferenceStore {
  remindersEnabled(): Promise<boolean>;
  setRemindersEnabled(enabled: boolean): Promise<void>;
}

/** Reminders are on by default; the player turns them off in settings. */
export const securePreferenceStore: PreferenceStore = {
  async remindersEnabled() {
    return (await SecureStore.getItemAsync(REMINDERS_KEY)) !== 'false';
  },
  async setRemindersEnabled(enabled) {
    await SecureStore.setItemAsync(REMINDERS_KEY, enabled ? 'true' : 'false');
  },
};
