import {createApiClient} from './client.ts';
import {LocalSessionAdapter} from './LocalSessionAdapter.ts';
export {createApiClient};
export type {ApiClient,ApiError} from './client.ts';
export {LocalSessionAdapter};
export type {SessionAdapter,SessionHeaders} from './LocalSessionAdapter.ts';
export const api=createApiClient({sessionAdapter:new LocalSessionAdapter()});
