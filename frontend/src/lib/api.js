// Elige dónde viven los datos:
// - Con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example): base compartida
//   en Supabase, la misma para toda la familia desde cualquier dispositivo.
// - Sin ellas: modo local, los datos quedan en este navegador (localApi.js).
import localApi from "./localApi";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const usingSupabase = Boolean(url && anonKey);

// La librería de Supabase se descarga solo si se usa.
function createLazySupabaseApi() {
  let ready;
  const load = () =>
    (ready ??= Promise.all([import("@supabase/supabase-js"), import("./supabaseApi")]).then(
      ([{ createClient }, { createSupabaseApi }]) => createSupabaseApi(createClient(url, anonKey)),
    ));
  const instance = { defaults: { headers: { common: {} } } };
  for (const m of ["get", "post", "put", "patch", "delete"]) {
    instance[m] = async (...args) => (await load())[m](...args);
  }
  return instance;
}

export function createApi() {
  return usingSupabase ? createLazySupabaseApi() : localApi.create();
}
