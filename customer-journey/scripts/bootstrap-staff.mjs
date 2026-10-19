// Run only after reviewed migration. Existing verified Supabase user is required.
import {createClient} from '@supabase/supabase-js';
const userId=process.argv[2];if(!/^[0-9a-f-]{36}$/i.test(userId||''))throw new Error('Usage: node scripts/bootstrap-staff.mjs VERIFIED_AUTH_USER_UUID');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const r=await db.auth.admin.getUserById(userId);if(r.error||!r.data.user?.email_confirmed_at)throw new Error('A verified existing Auth user is required');
const result=await db.from('cj_staff').upsert({user_id:userId,active:true});if(result.error)throw result.error;console.log('CJ staff enabled. MFA is required on first login.');
