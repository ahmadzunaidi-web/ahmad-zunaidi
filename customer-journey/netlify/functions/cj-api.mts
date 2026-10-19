import handler from '../../server/api.mjs';
export default handler;
// Served both directly and behind https://abangrecond.com/journey (proxied to /journey/api/cj/* on this site).
export const config={path:['/api/cj/*','/journey/api/cj/*'],rateLimit:{windowSize:60,windowLimit:300,aggregateBy:'ip',action:'rate_limit'}};
