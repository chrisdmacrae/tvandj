import AsyncStorage from '@react-native-async-storage/async-storage';
import { Jellyfin } from '@jellyfin/sdk';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

const DEVICE_ID_KEY = 'tv-and-j/device-id';

let instance: Promise<Jellyfin> | undefined;

/** Jellyfin identifies each client install by a stable device id. */
async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getJellyfin(): Promise<Jellyfin> {
  instance ??= getDeviceId().then(
    (id) =>
      new Jellyfin({
        clientInfo: { name: 'TV and J', version: Constants.expoConfig?.version ?? '0.0.0' },
        deviceInfo: { name: Device.deviceName ?? Device.modelName ?? 'Fire TV', id },
      }),
  );
  return instance;
}
