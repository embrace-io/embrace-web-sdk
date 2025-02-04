// TODO: unhardcode this
export const getEmbraceHeaders = (appID: string): Record<string, string> => ({
  'X-EM-AID': appID,
  'X-EM-DID': '018741D8E18447908A72222E7C002DB9',
});
// TODO: unhardcode this
export const getDataURL = (appID: string): string =>
  `https://a-${appID}.data.stg.emb-eng.com`;
