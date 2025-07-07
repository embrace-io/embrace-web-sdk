export const getEmbraceHeaders = (
  appID: string,
  userID: string
): Record<string, string> => ({
  'X-EM-AID': appID,
  'X-EM-DID': userID,
});

export const getDataURL = (appID: string): string =>
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  (process && process.env.EMBRACE_DATA_URL) ||
  `https://a-${appID}.data.emb-api.com`;
