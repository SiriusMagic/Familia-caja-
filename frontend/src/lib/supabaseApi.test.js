// Pruebas del puente con Supabase usando un cliente falso (sin internet).
import { describe, expect, it, vi } from "vitest";
import { createSupabaseApi } from "./supabaseApi";

function fakeClient({ profile = { id: "u1", email: "a@b.c", name: "Ana", role: "socio", status: "active", cedula: "", phone: "" }, rpc = {}, signIn = {}, signUp } = {}) {
  const calls = [];
  const client = {
    calls,
    rpc: vi.fn(async (name, args) => {
      calls.push([name, args]);
      const r = rpc[name];
      return typeof r === "function" ? r(args) : { data: r ?? null, error: null };
    }),
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }) }) }) }),
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
    auth: {
      getUser: async () => ({ data: { user: { id: profile.id } } }),
      getSession: async () => ({ data: { session: { access_token: "jwt" } } }),
      signInWithPassword: vi.fn(async () => ({ error: signIn.error ?? null })),
      signUp: vi.fn(async () => signUp ?? { data: { user: { id: "n1", identities: [{}] }, session: null }, error: null }),
      signOut: vi.fn(async () => ({})),
    },
  };
  return client;
}

describe("supabaseApi", () => {
  it("traduce rutas a funciones de la base", async () => {
    const c = fakeClient({ rpc: { my_summary: { savings: 75, debt: 0, available: 75 } } });
    const api = createSupabaseApi(c);
    expect((await api.get("/api/users/me/summary")).data.savings).toBe(75);
    await api.post("/api/loans/L1/vote", { vote: "for" });
    await api.post("/api/admin/users/U2/approve");
    await api.post("/api/payments/P1/reject");
    expect(c.calls.slice(1)).toEqual([
      ["vote_loan", { p_loan_id: "L1", p_vote: "for" }],
      ["admin_review_user", { p_user_id: "U2", p_approve: true }],
      ["admin_review_payment", { p_payment_id: "P1", p_approve: false }],
    ]);
  });

  it("convierte errores de permisos en 403 con el mensaje de la base", async () => {
    const c = fakeClient({ rpc: { admin_dashboard: () => ({ data: null, error: { code: "42501", message: "Acceso denegado: se requiere rol de admin" } }) } });
    const err = await createSupabaseApi(c).get("/api/admin/dashboard").catch((e) => e);
    expect(err.response).toEqual({ status: 403, data: { detail: "Acceso denegado: se requiere rol de admin" } });
  });

  it("no deja entrar a una cuenta pendiente y cierra su sesión", async () => {
    const c = fakeClient({ profile: { id: "u1", email: "a@b.c", name: "Ana", role: "socio", status: "pending" } });
    const err = await createSupabaseApi(c).post("/api/auth/login", { email: "A@B.C ", password: "x" }).catch((e) => e);
    expect(err.response.status).toBe(403);
    expect(c.auth.signOut).toHaveBeenCalled();
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.c", password: "x" });
  });

  it("login correcto devuelve el usuario y el token", async () => {
    const { data } = await createSupabaseApi(fakeClient()).post("/api/auth/login", { email: "a@b.c", password: "x" });
    expect(data).toMatchObject({ access_token: "jwt", user: { _id: "u1", role: "socio", status: "active" } });
  });

  it("contraseña incorrecta da un mensaje claro", async () => {
    const c = fakeClient({ signIn: { error: { status: 400, message: "Invalid login credentials" } } });
    const err = await createSupabaseApi(c).post("/api/auth/login", { email: "a@b.c", password: "mal" }).catch((e) => e);
    expect(err.response).toEqual({ status: 401, data: { detail: "Correo o contrasena incorrectos" } });
  });

  it("detecta un correo ya registrado", async () => {
    const c = fakeClient({ signUp: { data: { user: { id: "x", identities: [] }, session: null }, error: null } });
    const err = await createSupabaseApi(c).post("/api/auth/register", { email: "a@b.c", password: "123456", name: "Ana" }).catch((e) => e);
    expect(err.response.data.detail).toBe("Este correo ya esta registrado");
  });

  it("valida el monto del pago antes de subir nada", async () => {
    const c = fakeClient();
    const err = await createSupabaseApi(c).post("/api/payments", { amount: "0" }).catch((e) => e);
    expect(err.response.status).toBe(400);
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("nunca intenta cambiar contraseñas ajenas desde el navegador", async () => {
    const err = await createSupabaseApi(fakeClient()).post("/api/admin/users/u2/reset-password", { new_password: "x" }).catch((e) => e);
    expect(err.response.status).toBe(400);
  });
});
