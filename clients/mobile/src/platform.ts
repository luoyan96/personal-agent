import { requireNativeModule } from 'expo';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { MobileApi, type Transport, type WireRequest, type WireResponse } from './api';

type NativeTransport = { request(request: WireRequest): Promise<WireResponse>; cancel(id: string): Promise<void> };
const native = requireNativeModule<NativeTransport>('AcceptCatTransport');
const transport: Transport = {
  async request(request, signal) {
    if (signal.aborted) throw new Error('cancelled');
    const cancel = () => { void native.cancel(request.id).catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try { const result = await native.request(request); if (signal.aborted) throw new Error('cancelled'); return result; }
    finally { signal.removeEventListener('abort', cancel); }
  },
};
const key = 'acceptcat.session.v1';
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const uuid = () => Crypto.randomUUID();
export const api = new MobileApi(process.env.EXPO_PUBLIC_API_ORIGIN ?? 'https://chat.acceptcat.com', transport, {
  read: () => SecureStore.getItemAsync(key, secureOptions),
  write: value => SecureStore.setItemAsync(key, value, secureOptions),
  clear: () => SecureStore.deleteItemAsync(key, secureOptions),
}, uuid);
