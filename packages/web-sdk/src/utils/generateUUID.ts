const UUID_BYTES = 16;
const BUFFER = new Uint8Array(UUID_BYTES);

// Pre-computed uppercase hex lookup - faster than toString(16) in browsers
const HEX: string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0').toUpperCase(),
);

export const generateUUID = (): string => {
  crypto.getRandomValues(BUFFER);
  let hex = '';
  for (let i = 0; i < UUID_BYTES; i++) {
    hex += HEX[BUFFER[i]];
  }
  return hex;
};
