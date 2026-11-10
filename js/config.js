// ============================================================
//  SETTINGS: the only file to fill in for a new Supabase project.
//
//  Both values are in the Supabase project: Project Settings -> API
//    Project URL                        -> SUPABASE_URL
//    Project API keys -> publishable    -> SUPABASE_ANON_KEY
//
//  The publishable key is meant for the browser and isn't a secret: the data is protected by the
//  Row Level Security policies in supabase-schema.sql. NEVER put the service_role key here.
// ============================================================

export const SUPABASE_URL = 'https://wqibkufakgdmzcovmdos.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_f1A4zFIkN6pwnm8MRyk_1g_Dbt194dP';

// Shown in Settings, and in the service worker's cache name (sw.js VERSION must match).
export const APP_VERSION = '2.0.1';
