import {purgeExpiredDocuments} from '../../server/retention.mjs';
export default async()=>Response.json(await purgeExpiredDocuments());
export const config={schedule:'*/10 * * * *'};
