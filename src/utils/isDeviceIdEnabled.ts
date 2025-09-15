const DIGITS = 6;

/**
 * Determines whether a deviceId is enabled for the given pctEnabled. This is achieved
 * by taking a normalized hex value from the last 6 digits of the device ID, and comparing
 * it against the enabled percentage. This ensures that devices are consistently in a given
 * group for beta functionality.
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

const getNormalizedDeviceId = (deviceId: string): number => {
  const finalChars = deviceId.slice(-DIGITS); // last 6 chars
  const radix = 16;
  const space = Math.pow(radix, DIGITS) - 1;
  const value = parseInt(finalChars, radix);

  return (value / space) * 100;
};
