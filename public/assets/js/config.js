// =====================================================================
//  Configuración de Supabase
//  Supabase > Project Settings > API (Data API / API Keys)
//  · SUPABASE_URL: "Project URL"
//  · SUPABASE_KEY: clave pública "anon" o "publishable" (NUNCA la service_role/secret)
//  Esta clave es pública por diseño: la seguridad la aplican las políticas RLS
//  definidas en supabase/schema.sql.
// =====================================================================
export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_KEY = 'TU-CLAVE-PUBLICA-ANON';

export const STORAGE_BUCKET = 'media';

export const isConfigured = () =>
  !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_KEY.startsWith('TU-');
