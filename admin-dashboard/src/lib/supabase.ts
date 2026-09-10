import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// ============================================================
// IMPORTANT: Replace these values with your Supabase project
// credentials. Find them at:
//   https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
//
// DO NOT put the service_role key here — only use the anon key.
// ============================================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://eabwhgujwywwiormujrr.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYndoZ3Vqd3l3d2lvcm11anJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NzE4OTAsImV4cCI6MjEwMjU0Nzg5MH0.Evq9rRYECPnwe2rU-a7FJ8-Ygwk1YKzcEDeWXkyzjMg'


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
