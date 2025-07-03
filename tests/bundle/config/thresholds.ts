const getFromEnv = (key: string, defaultValue: number): number => {
  const value = process.env[key];

  return value ? parseInt(value, 10) : defaultValue;
};

const TOTAL_UNCOMPRESSED_SIZE_THRESHOLD_IN_KB = getFromEnv(
  'TOTAL_UNCOMPRESSED_SIZE_THRESHOLD_IN_KB',
  180
);
const TOTAL_GZIP_SIZE_THRESHOLD_IN_KB = getFromEnv(
  'TOTAL_GZIP_SIZE_THRESHOLD_IN_KB',
  65
);

export {
  TOTAL_UNCOMPRESSED_SIZE_THRESHOLD_IN_KB,
  TOTAL_GZIP_SIZE_THRESHOLD_IN_KB,
};
