import { setupOTel } from './otel';

export const init = () => {
  setupOTel();
};

export const getBasename = (routerName: string): string => {
  return import.meta.env.BASE_URL !== '/'
    ? import.meta.env.BASE_URL + routerName
    : `/${routerName}`;
};

export const exit = () => {
  window.location.assign(import.meta.env.BASE_URL);
};
