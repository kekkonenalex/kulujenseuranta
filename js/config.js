// ============================================================
//  ASETUKSET - tama on ainoa tiedosto jota sinun tarvitsee muokata.
//
//  Loydat molemmat arvot Supabase-projektistasi:
//    Project Settings -> API
//      * Project URL          -> SUPABASE_URL
//      * Project API keys -> anon public  -> SUPABASE_ANON_KEY
//
//  Anon-avain on tarkoitettu selaimeen ja on julkinen tieto.
//  Dataa suojaavat RLS-politiikat, jotka supabase-schema.sql luo.
//  ALA koskaan laita tahan service_role -avainta.
// ============================================================

export const SUPABASE_URL = 'https://wqibkufakgdmzcovmdos.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_f1A4zFIkN6pwnm8MRyk_1g_Dbt194dP';

// Nakyy asetuksissa ja service workerin cache-nimessa.
export const APP_VERSION = '1.3.0';
