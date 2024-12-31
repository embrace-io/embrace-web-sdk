import {v4 as uuid} from 'uuid';

const generateUUID = () => uuid().replace(/-/g, '').toUpperCase();

export default generateUUID;
