export const getEmbraceHeaders = (
  appID: string,
  userID: string
): Record<string, string> => ({
  'X-EM-AID': appID,
  'X-EM-DID': userID,
});
export const getDataURL = (_appId: string): string => `http://localhost:3001`;
