import { API_URL } from './api';

/** Catalog pictures may come as paths on the API host. */
export const imageUrl = (url?: string) => (url && !/^https?:/.test(url) ? `${API_URL}${url}` : url);
