import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client para Server Components e Route Handlers (acesso total)
export function createServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

// Client para Client Components (acesso restrito com RLS)
export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}
