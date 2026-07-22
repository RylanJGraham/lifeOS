import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Single-user app: disable the cross-tab auth lock. The default
// navigator.locks-based lock can hang getSession() forever after site-data
// clears / dead tabs, leaving the app stuck on "Authenticating…".
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => await fn(),
  },
});
