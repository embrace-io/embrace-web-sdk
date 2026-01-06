const UUID_BYTES = 16;
const BUFFER = new Uint8Array(UUID_BYTES);

// Pre-computed uppercase hex lookup - faster than toString(16) in browsers
const HEX: string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0').toUpperCase(),
);

function randomFill(buf: Uint8Array): void {
  for (let i = 0; i < buf.length; i++) {
    buf[i] = (Math.random() * 256) >>> 0;
  }
  // Ensure non-zero per W3C Trace Context spec
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 0) return;
  }
  buf[buf.length - 1] = 1;
}

export const generateUUID = (): string => {
  randomFill(BUFFER);
  let hex = '';
  for (let i = 0; i < BUFFER.length; i++) {
    hex += HEX[BUFFER[i]];
  }
  return hex;
};
