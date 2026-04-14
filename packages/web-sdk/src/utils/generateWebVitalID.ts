// Generates a unique ID for web vitals metrics, following the format "v5-{timestamp}-{randomNumber}"
// https://github.com/GoogleChrome/web-vitals/blob/main/src/lib/generateUniqueID.ts
export const generateWebVitalID = () => {
  return `embracev1-${Date.now()}-${Math.floor(Math.random() * (9e12 - 1)) + 1e12}`;
};
