export const getBasename = (routerName: string): string => {
  return import.meta.env.BASE_URL !== '/'
    ? import.meta.env.BASE_URL + routerName
    : `/${routerName}`;
};
