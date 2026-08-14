const UUID_BYTES = 16;
const BUFFER = new Uint8Array(UUID_BYTES);

// Pre-computed uppercase hex lookup - faster than toString(16) in browsers.
// Flat string rather than an array of pairs so a byte lookup is a total slice.
const HEX = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0').toUpperCase(),
).join('');

export const generateUUID = (): string => {
  crypto.getRandomValues(BUFFER);
  let hex = '';
  for (const byte of BUFFER) {
    hex += HEX.slice(byte * 2, byte * 2 + 2);
  }
  return hex;
};
