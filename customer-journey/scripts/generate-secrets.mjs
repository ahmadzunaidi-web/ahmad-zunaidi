// Operator runs locally; never commit output or pipe it to a public deploy log.
import webpush from 'web-push';import{randomBytes}from 'node:crypto';
const keys=webpush.generateVAPIDKeys();console.log(JSON.stringify({TRACKER_LOOKUP_SECRET:randomBytes(32).toString('hex'),SESSION_SECRET:randomBytes(32).toString('hex'),VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey},null,2));
