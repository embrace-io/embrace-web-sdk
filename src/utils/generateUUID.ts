import {v4 as uuid} from 'uuid';

export const generateUUID = () => uuid().replace(/-/g, '').toUpperCase();
