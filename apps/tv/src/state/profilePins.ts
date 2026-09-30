import { secureStorage } from './secureStorage';

/**
 * Optional 4-digit PINs that lock profiles on this TV (e.g. so kids can't
 * switch into an adult's profile). Local to the device, like Netflix's
 * profile locks; the Jellyfin password is the way back in if one's forgotten.
 *
 * Stored in secure storage (encrypted by the Android keystore). There's no
 * point hashing them: with 10,000 possible PINs, any hash is reversible.
 */
const PINS_KEY = 'tv-and-j.profile-pins';

export const PIN_LENGTH = 4;

type Pins = Record<string, string>;

async function load(): Promise<Pins> {
  try {
    const raw = await secureStorage.get(PINS_KEY);
    return raw ? (JSON.parse(raw) as Pins) : {};
  } catch {
    return {};
  }
}

/** userIds with a PIN. */
export async function lockedProfiles(): Promise<Set<string>> {
  return new Set(Object.keys(await load()));
}

export async function hasPin(userId: string) {
  return !!(await load())[userId];
}

export async function checkPin(userId: string, pin: string) {
  const stored = (await load())[userId];
  return !stored || stored === pin;
}

export async function setPin(userId: string, pin: string | null) {
  const pins = await load();
  if (pin) pins[userId] = pin;
  else delete pins[userId];
  await secureStorage.set(PINS_KEY, JSON.stringify(pins));
}
