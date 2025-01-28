// TODO: unhardcode this
const getEmbraceHeaders = (appID: string): Record<string, string> => ({
  'X-EM-AID': appID,
  'X-EM-DID': '018741D8E18447908A72222E7C002DB9',
});

export { getEmbraceHeaders };
