import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// ============================================================
// IMPORTANT: Replace these values with your Supabase project
// credentials. Find them at:
//   https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
//
// DO NOT put the service_role key here — only use the anon key.
// ============================================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

if (SUPABASE_URL.includes('YOUR_PROJECT') || SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY')) {
  console.warn(
    '[SHUBE] Supabase credentials not configured.\n' +
    'Create an admin-dashboard/.env file with:\n' +
    '  VITE_SUPABASE_URL=https://yourproject.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=your_anon_key'
  )
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

export default supabase
