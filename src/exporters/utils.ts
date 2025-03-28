export const getEmbraceHeaders = (
  appID: string,
  userID: string
): Record<string, string> => ({
  'X-EM-AID': appID,
  'X-EM-DID': userID,
});
export const getDataURL = (appID: string): string =>
  `https://a-${appID}.data.stg.emb-eng.com`;
