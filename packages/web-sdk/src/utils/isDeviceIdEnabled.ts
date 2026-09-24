const DIGITS = 6;

/**
 * Determines whether a deviceId is enabled for the given pctEnabled. It maps the last 6 hex
 * digits of the device ID to a value from 0 to 100 and compares it against the percentage,
 * so a device is always in the same group for beta functionality.
 *
 * This can be used to:
 * - Select sample devices for telemetry collection
 * - Enable/disable features for a percentage of users
 *
 * The normalized device ID has 16^6 possibilities (roughly 1.6m) which should be sufficient
 * granularity for our needs.
 */
export const isDeviceIdEnabled = (deviceId: string, pctEnabled?: number) => {
  if (!pctEnabled || pctEnabled <= 0 || pctEnabled > 100) {
    return false;
  }

  const normalizedDeviceId = getNormalizedDeviceId(deviceId);

  return pctEnabled >= normalizedDeviceId;
};

export const getNormalizedDeviceId = (deviceId: string): number => {
  if (deviceId.length < DIGITS) {
    return 0;
  }

  const finalChars = deviceId.slice(-DIGITS); // last 6 chars
  const radix = 16;
  const space = radix ** DIGITS - 1;
  const value = parseInt(finalChars, radix);

  return (value / space) * 100;
};
