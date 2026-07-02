import { webcrypto } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';
import {
  clearDeviceWrapSecret,
  DEVICE_WRAP_KEY,
  migrateDeviceWrapKeyToHardware,
  unwrapDeviceSecret,
  wrapDeviceSecret,
} from '../deviceWrapCrypto';
import {
  getHardwareSecret,
  isHardwareSecretStoreAvailable,
  removeHardwareSecret,
  setHardwareSecret,
} from '../hardwareSecretStore';
import { isNativeApp } from '../platform';

global.crypto = webcrypto;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

jest.mock('../hardwareSecretStore', () => ({
  isHardwareSecretStoreAvailable: jest.fn(async () => false),
  getHardwareSecret: jest.fn(async () => null),
  setHardwareSecret: jest.fn(async () => false),
  removeHardwareSecret: jest.fn(async () => {}),
}));

jest.mock('../platform', () => ({
  isNativeApp: jest.fn(() => false),
}));

const LEGACY_KEY_B64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

function mockHardwareBacking() {
  let hwValue = null;
  isHardwareSecretStoreAvailable.mockResolvedValue(true);
  getHardwareSecret.mockImplementation(async () => hwValue);
  setHardwareSecret.mockImplementation(async (_key, value) => {
    hwValue = value;
    return true;
  });
  removeHardwareSecret.mockImplementation(async () => {
    hwValue = null;
  });
  return () => hwValue;
}

describe('deviceWrapCrypto', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    isHardwareSecretStoreAvailable.mockResolvedValue(false);
    getHardwareSecret.mockResolvedValue(null);
    setHardwareSecret.mockResolvedValue(false);
    removeHardwareSecret.mockResolvedValue(undefined);
  });

  it('falls back to localStorage when hardware is unavailable', async () => {
    await wrapDeviceSecret('secret-a');
    expect(localStorage.getItem(DEVICE_WRAP_KEY)).toBeTruthy();
    expect(setHardwareSecret).not.toHaveBeenCalled();
    expect(await unwrapDeviceSecret(await wrapDeviceSecret('secret-b'))).toBe('secret-b');
  });

  it('migrates legacy localStorage wrap key to hardware on read', async () => {
    mockHardwareBacking();
    localStorage.setItem(DEVICE_WRAP_KEY, LEGACY_KEY_B64);

    const blob = await wrapDeviceSecret('migrated-secret');
    expect(setHardwareSecret).toHaveBeenCalledWith(DEVICE_WRAP_KEY, LEGACY_KEY_B64);
    expect(localStorage.getItem(DEVICE_WRAP_KEY)).toBeNull();
    expect(await unwrapDeviceSecret(blob)).toBe('migrated-secret');
  });

  it('prefers hardware store over localStorage', async () => {
    isHardwareSecretStoreAvailable.mockResolvedValue(true);
    getHardwareSecret.mockResolvedValue(LEGACY_KEY_B64);
    localStorage.setItem(DEVICE_WRAP_KEY, 'stale-key');

    await wrapDeviceSecret('hw-secret');
    expect(setHardwareSecret).not.toHaveBeenCalled();
    expect(localStorage.getItem(DEVICE_WRAP_KEY)).toBe('stale-key');
  });

  it('migrateDeviceWrapKeyToHardware moves legacy key and clears localStorage', async () => {
    mockHardwareBacking();
    localStorage.setItem(DEVICE_WRAP_KEY, LEGACY_KEY_B64);

    expect(await migrateDeviceWrapKeyToHardware()).toBe(true);
    expect(setHardwareSecret).toHaveBeenCalledWith(DEVICE_WRAP_KEY, LEGACY_KEY_B64);
    expect(localStorage.getItem(DEVICE_WRAP_KEY)).toBeNull();
  });

  it('migrateDeviceWrapKeyToHardware clears stale localStorage when hardware already has key', async () => {
    isHardwareSecretStoreAvailable.mockResolvedValue(true);
    getHardwareSecret.mockResolvedValue(LEGACY_KEY_B64);
    localStorage.setItem(DEVICE_WRAP_KEY, 'stale-key');

    expect(await migrateDeviceWrapKeyToHardware()).toBe(true);
    expect(localStorage.getItem(DEVICE_WRAP_KEY)).toBeNull();
    expect(setHardwareSecret).not.toHaveBeenCalled();
  });

  it('clearDeviceWrapSecret removes hardware and localStorage entries', async () => {
    isHardwareSecretStoreAvailable.mockResolvedValue(true);
    localStorage.setItem(DEVICE_WRAP_KEY, LEGACY_KEY_B64);

    await clearDeviceWrapSecret();
    expect(removeHardwareSecret).toHaveBeenCalledWith(DEVICE_WRAP_KEY);
    expect(localStorage.getItem(DEVICE_WRAP_KEY)).toBeNull();
  });

  it('keeps localStorage backup on native after hardware migration', async () => {
    isNativeApp.mockReturnValue(true);
    mockHardwareBacking();
    localStorage.setItem(DEVICE_WRAP_KEY, LEGACY_KEY_B64);

    await wrapDeviceSecret('native-backup');
    expect(setHardwareSecret).toHaveBeenCalledWith(DEVICE_WRAP_KEY, LEGACY_KEY_B64);
    expect(localStorage.getItem(DEVICE_WRAP_KEY)).toBe(LEGACY_KEY_B64);
  });
});