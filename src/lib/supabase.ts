import { createClient } from '@supabase/supabase-js'
import {
  missingSupabasePublicKeyVars,
  supabasePublicKeyOrUndefined,
} from './supabase-public'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
// Centralised public-credential resolution: prefers NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
// and falls back to the legacy anon key during migration.
const supabaseKey = supabasePublicKeyOrUndefined()

if (!supabaseUrl || !supabaseKey) {
  // Variable NAMES only — never values.
  throw new Error(
    'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and ' +
      `${missingSupabasePublicKeyVars().join(' or ')} must be set in .env.local`
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
