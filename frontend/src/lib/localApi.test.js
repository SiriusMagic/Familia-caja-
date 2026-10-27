// Pruebas del servidor simulado de AhorroFamiliar (usuarios, pagos y préstamos por votación).
import { beforeEach, describe, expect, it } from "vitest";
import axios, { resetLocalData } from "./localApi";

let store = {};
globalThis.window = {
  localStorage: {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  },
};
const as = (token) => {
  const a = axios.create();
  if (token) a.defaults.headers.common.Authorization = `Bearer ${token}`;
  return a;
};
const fails = async (promise) => {
  try { await promise; } catch (e) { return e.response; }
  throw new Error("se esperaba un error");
};
const anon = as();
const login = async (email, password) => as((await anon.post("/api/auth/login", { email, password })).data.access_token);

let admin, pending;
beforeEach(async () => {
  store = {};
  resetLocalData();
  await anon.post("/api/auth/register", { email: "Admin@x.com", password: "a1", name: "Ana" });
  for (const [email, name] of [["b@x.com", "Beto"], ["c@x.com", "Caro"], ["d@x.com", "Dani"]]) {
    await anon.post("/api/auth/register", { email, password: "pw", name });
  }
  admin = await login("admin@x.com", "a1");
  pending = (await admin.get("/api/admin/pending-users")).data;
});

describe("registro y acceso", () => {
  it("el primer usuario es administrador activo y no expone su contraseña", async () => {
    const me = (await admin.get("/api/auth/me")).data;
    expect(me.role).toBe("admin");
    expect(me.password_hash).toBeUndefined();
  });

  it("los siguientes quedan pendientes y no pueden entrar", async () => {
    expect(pending).toHaveLength(3);
    expect((await fails(anon.post("/api/auth/login", { email: "b@x.com", password: "pw" }))).status).toBe(403);
  });

  it("no permite correos repetidos", async () => {
    expect((await fails(anon.post("/api/auth/register", { email: "b@x.com", password: "x", name: "x" }))).status).toBe(400);
  });

  it("aprobar y rechazar registros", async () => {
    await admin.post(`/api/admin/users/${pending[0]._id}/approve`);
    await admin.post(`/api/admin/users/${pending[2]._id}/reject`);
    expect((await (await login("b@x.com", "pw")).get("/api/auth/me")).data.name).toBe("Beto");
    expect((await fails(anon.post("/api/auth/login", { email: "d@x.com", password: "pw" }))).data.detail).toBe("Tu cuenta ha sido rechazada");
  });

  it("un socio no puede ver el panel de administración", async () => {
    await admin.post(`/api/admin/users/${pending[0]._id}/approve`);
    const beto = await login("b@x.com", "pw");
    expect((await fails(beto.get("/api/admin/dashboard"))).status).toBe(403);
  });

  it("bloquea 15 minutos tras 5 intentos fallidos", async () => {
    await admin.post(`/api/admin/users/${pending[1]._id}/approve`);
    for (let i = 0; i < 5; i++) await fails(anon.post("/api/auth/login", { email: "c@x.com", password: "mala" }));
    expect((await fails(anon.post("/api/auth/login", { email: "c@x.com", password: "pw" }))).status).toBe(429);
  });

  it("no guarda contraseñas en texto plano y rechaza tokens falsos", async () => {
    expect(JSON.stringify(store)).not.toContain('"pw"');
    expect((await fails(as("basura").get("/api/auth/me"))).status).toBe(401);
  });

  it("el admin restablece contraseñas y cambia roles", async () => {
    await admin.post(`/api/admin/users/${pending[1]._id}/approve`);
    await admin.post(`/api/admin/users/${pending[1]._id}/reset-password`, { new_password: "nuevo" });
    const caro = await login("c@x.com", "nuevo");
    await admin.post(`/api/admin/users/${pending[1]._id}/role`, { role: "admin" });
    expect((await caro.get("/api/auth/me")).data.role).toBe("admin");
  });
});

describe("pagos y préstamos", () => {
  let beto, caro;
  beforeEach(async () => {
    await admin.post(`/api/admin/users/${pending[0]._id}/approve`);
    await admin.post(`/api/admin/users/${pending[1]._id}/approve`);
    beto = await login("b@x.com", "pw");
    caro = await login("c@x.com", "pw");
  });

  it("un pago aprobado suma al ahorro y a la caja", async () => {
    const fd = new FormData();
    fd.append("amount", "120"); fd.append("type", "ahorro"); fd.append("note", "oct");
    await beto.post("/api/payments", fd);
    const [p] = (await admin.get("/api/admin/payments/pending")).data;
    expect(p.user_name).toBe("Beto");
    await admin.post(`/api/payments/${p._id}/approve`);
    expect((await fails(admin.post(`/api/payments/${p._id}/approve`))).status).toBe(404);
    expect((await beto.get("/api/users/me/summary")).data.savings).toBe(120);
    expect((await admin.get("/api/admin/dashboard")).data.caja_total).toBe(120);
  });

  it("un préstamo se aprueba por mayoría y no se puede votar el propio ni dos veces", async () => {
    expect((await fails(beto.post("/api/loans", { amount: 50, purpose: "viajes" }))).status).toBe(400);
    await beto.post("/api/loans", { amount: 50, purpose: "Salud", description: "x" });
    const [loan] = (await caro.get("/api/loans")).data;
    expect(loan.can_vote).toBe(true);
    expect(loan.eligible_voters).toBe(2);
    expect((await fails(beto.post(`/api/loans/${loan._id}/vote`, { vote: "for" }))).status).toBe(400);
    expect((await caro.post(`/api/loans/${loan._id}/vote`, { vote: "for" })).data.message).toBe("Voto registrado");
    expect((await fails(caro.post(`/api/loans/${loan._id}/vote`, { vote: "for" }))).status).toBe(400);
    expect((await admin.post(`/api/loans/${loan._id}/vote`, { vote: "for" })).data.status).toBe("active");
    const s = (await beto.get("/api/users/me/summary")).data;
    expect(s.debt).toBe(50);
  });
});
