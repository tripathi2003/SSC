/**
 * Installed-client messaging policy (no chat/migration imports).
 */
import { isInstalledClient } from '../platform';

/** True when this device must never fall back to RSA vault messaging. */
export function usesSignalOnlyMessaging() {
  return isInstalledClient();
}