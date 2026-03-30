import { session } from '@embrace-io/web-sdk';

export const getBasename = (routerName: string): string => {
  return import.meta.env.BASE_URL !== '/'
    ? import.meta.env.BASE_URL + routerName
    : `/${routerName}`;
};

export const getSessionAttributes = (): Record<string, string> | null => {
  const span = session.getSpanSessionManager().getSessionSpan();
  if (span && 'attributes' in span) {
    return (span as { attributes: Record<string, string> }).attributes;
  }
  return null;
};
