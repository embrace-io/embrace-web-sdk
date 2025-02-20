export const isValidAppID = (appID?: string): appID is string => {
  if (appID === undefined) {
    throw new Error('appID is required when using Embrace exporter');
  }
  if (appID.length !== 5) {
    throw new Error('appID should be 5 characters long');
  }
  return true;
};
