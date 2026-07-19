/// <reference types="vite/client" />

/**
 * Typed `import.meta.env` for LumaLoop's web app (accounts pivot). Only the two
 * Supabase client vars are declared here; both are public (publishable anon key
 * + project URL) and safe in the client bundle — RLS is the security boundary.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
