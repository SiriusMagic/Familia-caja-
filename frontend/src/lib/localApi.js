// Servidor simulado que corre en el navegador.
//
// Reemplaza al antiguo backend FastAPI + MongoDB con las mismas rutas (/api/...)
// y la misma lógica: registro con aprobación, roles, pagos con comprobante y
// préstamos aprobados por votación. Los datos se guardan en localStorage, así que
// todos los usuarios comparten este navegador (la computadora hace de servidor).
//
// Diferencia con el original: no hay administrador predefinido. El PRIMER usuario
// que se registra queda como administrador activo.
//
// Expone la misma interfaz que una instancia de axios (get/post + defaults.headers).

const STORAGE_KEY = "ahorro-familiar-db-v1";
const TOKEN_PREFIX = "local.";
const LOCK_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const VALID_PURPOSES = ["vanidad", "salud", "educacion", "emergencia", "negocio", "otro"];

// ---------- Base de datos ----------

const emptyDb = () => ({ users: [], payments: [], loans: [], login_attempts: {} });
let memoryDb = null;

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyDb(), ...JSON.parse(raw) };
  } catch {
    if (memoryDb) return memoryDb;
  }
  return memoryDb || emptyDb();
}

function save(db) {
  memoryDb = db;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    fail(507, "No queda espacio en este navegador. Borra comprobantes antiguos o datos del sitio.");
  }
}

// ---------- Utilidades ----------

class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.response = { status, data: { detail } };
  }
}
function fail(status, detail) {
  throw new ApiError(status, detail);
}

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();

async function hashPassword(password, salt) {
  const text = `${salt}:${password}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Sin crypto.subtle (página servida por http no seguro): hash simple de respaldo.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `fnv-${(h >>> 0).toString(16)}`;
}

async function makePasswordHash(password) {
  const salt = newId();
  return { salt, hash: await hashPassword(password, salt) };
}

async function checkPassword(user, password) {
  return (await hashPassword(password, user.password_salt)) === user.password_hash;
}

const publicUser = (u) => {
  const { password_hash, password_salt, ...rest } = u; // eslint-disable-line no-unused-vars
  return rest;
};

// Reduce una imagen a máx. 1000 px en JPEG para que quepa en localStorage.
async function fileToCompressedDataUrl(file) {
  if (file.size > 5 * 1024 * 1024) fail(400, "Archivo muy grande (max 5MB)");
  const original = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  if (!file.type.startsWith("image/") || typeof document === "undefined") return original;
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = original;
    });
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return original;
  }
}

function bodyToObject(data) {
  if (data == null) return {};
  if (typeof FormData !== "undefined" && data instanceof FormData) return Object.fromEntries(data.entries());
  if (typeof data === "string") {
    try { return JSON.parse(data); } catch { return {}; }
  }
  return data;
}

// ---------- Autenticación ----------

function currentUser(db, headers) {
  const auth = headers.Authorization || headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) fail(401, "No autenticado");
  if (!token.startsWith(TOKEN_PREFIX)) fail(401, "Token invalido");
  const user = db.users.find((u) => u._id === token.slice(TOKEN_PREFIX.length));
  if (!user) fail(401, "Usuario no encontrado");
  return user;
}
function requireAdmin(db, headers) {
  const user = currentUser(db, headers);
  if (user.role !== "admin") fail(403, "Acceso denegado: se requiere rol de admin");
  return user;
}
function requireActive(db, headers) {
  const user = currentUser(db, headers);
  if (user.status !== "active") fail(403, "Tu cuenta aun no ha sido aprobada");
  return user;
}

function loanView(loan, user, activeUsers) {
  const { votes_for = [], votes_against = [], ...rest } = loan;
  const view = { ...rest, votes_for_count: votes_for.length, votes_against_count: votes_against.length };
  if (user) {
    view.eligible_voters = activeUsers - 1;
    view.my_vote = votes_for.includes(user._id) ? "for" : votes_against.includes(user._id) ? "against" : null;
    view.can_vote = user._id !== loan.user_id && view.my_vote === null && loan.status === "voting";
  }
  return view;
}

const byCreatedDesc = (a, b) => (b.created_at || "").localeCompare(a.created_at || "");
const countActive = (db) => db.users.filter((u) => u.status === "active").length;

// ---------- Rutas ----------

const routes = [
  ["GET", "/", () => ({ message: "AhorroFamiliar API (local)" })],

  // --- Auth ---
  ["POST", "/auth/register", async ({ db, body }) => {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !body.password || !body.name) fail(400, "Completa nombre, correo y contraseña");
    if (db.users.some((u) => u.email === email)) fail(400, "Este correo ya esta registrado");
    const isFirst = db.users.length === 0;
    const { salt, hash } = await makePasswordHash(body.password);
    const user = {
      _id: newId(), email, password_hash: hash, password_salt: salt, name: String(body.name).trim(),
      cedula: String(body.cedula || "").trim(), phone: String(body.phone || "").trim(),
      role: isFirst ? "admin" : "socio", status: isFirst ? "active" : "pending", created_at: nowIso(),
    };
    db.users.push(user);
    save(db);
    return isFirst
      ? { message: "Eres el primer usuario: tu cuenta es de administrador y ya está activa. Inicia sesión.", user_id: user._id, status: "active" }
      : { message: "Tu cuenta espera aprobacion del administrador", user_id: user._id, status: "pending" };
  }],
  ["POST", "/auth/login", async ({ db, body }) => {
    const email = String(body.email || "").trim().toLowerCase();
    const attempt = db.login_attempts[email];
    if (attempt && attempt.count >= LOCK_ATTEMPTS) {
      if (new Date() < new Date(attempt.locked_until)) fail(429, "Demasiados intentos. Intenta en 15 minutos.");
      delete db.login_attempts[email];
    }
    const user = db.users.find((u) => u.email === email);
    if (!user || !(await checkPassword(user, String(body.password || "")))) {
      const prev = db.login_attempts[email] || { count: 0 };
      db.login_attempts[email] = { count: prev.count + 1, locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() };
      save(db);
      fail(401, "Correo o contrasena incorrectos");
    }
    if (user.status === "pending") fail(403, "Tu cuenta espera aprobacion del administrador");
    if (user.status === "rejected") fail(403, "Tu cuenta ha sido rechazada");
    if (user.status === "suspended") fail(403, "Tu cuenta ha sido suspendida");
    delete db.login_attempts[email];
    save(db);
    const { _id, name, role, status, cedula, phone } = user;
    return { access_token: TOKEN_PREFIX + _id, user: { _id, email, name, role, status, cedula, phone } };
  }],
  ["POST", "/auth/logout", () => ({ message: "Sesion cerrada" })],
  ["GET", "/auth/me", ({ db, headers }) => publicUser(currentUser(db, headers))],

  // --- Admin ---
  ["GET", "/admin/dashboard", ({ db, headers }) => {
    requireAdmin(db, headers);
    const sum = (arr) => arr.reduce((a, x) => a + (Number(x.amount) || 0), 0);
    return {
      caja_total: sum(db.payments.filter((p) => p.status === "approved")),
      prestamos_activos: sum(db.loans.filter((l) => l.status === "active")),
      socios_pendientes: db.users.filter((u) => u.status === "pending").length,
      total_socios: db.users.filter((u) => u.role === "socio" && u.status === "active").length,
      pagos_pendientes: db.payments.filter((p) => p.status === "pending").length,
      prestamos_en_votacion: db.loans.filter((l) => l.status === "voting").length,
    };
  }],
  ["GET", "/admin/pending-users", ({ db, headers }) => {
    requireAdmin(db, headers);
    return db.users.filter((u) => u.status === "pending").map(publicUser);
  }],
  ["POST", "/admin/users/:id/approve", ({ db, headers, params }) => {
    requireAdmin(db, headers);
    const u = db.users.find((x) => x._id === params.id && x.status === "pending") || fail(404, "Usuario no encontrado o ya aprobado");
    u.status = "active";
    save(db);
    return { message: "Usuario aprobado exitosamente" };
  }],
  ["POST", "/admin/users/:id/reject", ({ db, headers, params }) => {
    requireAdmin(db, headers);
    const u = db.users.find((x) => x._id === params.id && x.status === "pending") || fail(404, "Usuario no encontrado");
    u.status = "rejected";
    save(db);
    return { message: "Usuario rechazado" };
  }],
  ["POST", "/admin/users/:id/role", ({ db, headers, params, body }) => {
    requireAdmin(db, headers);
    if (!["admin", "socio"].includes(body.role)) fail(400, "Rol invalido");
    const u = db.users.find((x) => x._id === params.id) || fail(404, "Usuario no encontrado");
    u.role = body.role;
    save(db);
    return { message: `Rol cambiado a ${body.role}` };
  }],
  ["POST", "/admin/users/:id/reset-password", async ({ db, headers, params, body }) => {
    requireAdmin(db, headers);
    const u = db.users.find((x) => x._id === params.id) || fail(404, "Usuario no encontrado");
    if (!body.new_password) fail(400, "Escribe la nueva contraseña");
    const { salt, hash } = await makePasswordHash(body.new_password);
    u.password_salt = salt;
    u.password_hash = hash;
    save(db);
    return { message: "Contrasena reseteada exitosamente" };
  }],
  ["GET", "/admin/payments/pending", ({ db, headers }) => {
    requireAdmin(db, headers);
    return db.payments.filter((p) => p.status === "pending").map((p) => {
      const u = db.users.find((x) => x._id === p.user_id);
      return { ...p, user_name: u ? u.name : "Desconocido", user_email: u ? u.email : "" };
    });
  }],

  // --- Usuarios ---
  ["GET", "/users", ({ db, headers }) => {
    requireAdmin(db, headers);
    return db.users.map(publicUser);
  }],
  ["GET", "/users/me/summary", ({ db, headers }) => {
    const user = requireActive(db, headers);
    const savings = db.payments.filter((p) => p.user_id === user._id && p.status === "approved").reduce((a, p) => a + Number(p.amount), 0);
    const debt = db.loans.filter((l) => l.user_id === user._id && l.status === "active").reduce((a, l) => a + Number(l.amount), 0);
    return { savings, debt, available: savings - debt };
  }],

  // --- Pagos ---
  ["POST", "/payments", async ({ db, headers, body }) => {
    const user = requireActive(db, headers);
    const amount = Number(body.amount);
    if (!(amount > 0)) fail(400, "Monto invalido");
    const receipt = body.receipt && typeof body.receipt === "object" && "size" in body.receipt && body.receipt.size > 0
      ? await fileToCompressedDataUrl(body.receipt)
      : null;
    const payment = {
      _id: newId(), user_id: user._id, amount, type: body.type || "ahorro", note: body.note || "",
      receipt_image: receipt, status: "pending", created_at: nowIso(),
    };
    db.payments.push(payment);
    save(db);
    return { message: "Pago enviado para aprobacion", payment_id: payment._id };
  }],
  ["GET", "/payments/my", ({ db, headers }) => {
    const user = requireActive(db, headers);
    return db.payments.filter((p) => p.user_id === user._id).sort(byCreatedDesc).slice(0, 100);
  }],
  ["POST", "/payments/:id/approve", ({ db, headers, params }) => {
    const admin = requireAdmin(db, headers);
    const p = db.payments.find((x) => x._id === params.id && x.status === "pending") || fail(404, "Pago no encontrado o ya procesado");
    Object.assign(p, { status: "approved", approved_by: admin._id, approved_at: nowIso() });
    save(db);
    return { message: "Pago aprobado" };
  }],
  ["POST", "/payments/:id/reject", ({ db, headers, params }) => {
    const admin = requireAdmin(db, headers);
    const p = db.payments.find((x) => x._id === params.id && x.status === "pending") || fail(404, "Pago no encontrado o ya procesado");
    Object.assign(p, { status: "rejected", rejected_by: admin._id, rejected_at: nowIso() });
    save(db);
    return { message: "Pago rechazado" };
  }],

  // --- Préstamos ---
  ["POST", "/loans", ({ db, headers, body }) => {
    const user = requireActive(db, headers);
    const purpose = String(body.purpose || "").toLowerCase();
    if (!VALID_PURPOSES.includes(purpose)) fail(400, `Proposito invalido. Opciones: ${VALID_PURPOSES.join(", ")}`);
    const amount = Number(body.amount);
    if (!(amount > 0)) fail(400, "Monto invalido");
    const loan = {
      _id: newId(), user_id: user._id, user_name: user.name, amount, purpose, description: body.description || "",
      status: "voting", votes_for: [], votes_against: [], created_at: nowIso(),
    };
    db.loans.push(loan);
    save(db);
    return { message: "Solicitud de prestamo creada. Los socios votaran.", loan_id: loan._id };
  }],
  ["GET", "/loans", ({ db, headers }) => {
    const user = requireActive(db, headers);
    const active = countActive(db);
    return [...db.loans].sort(byCreatedDesc).slice(0, 100).map((l) => loanView(l, user, active));
  }],
  ["GET", "/loans/my", ({ db, headers }) => {
    const user = requireActive(db, headers);
    return db.loans.filter((l) => l.user_id === user._id).sort(byCreatedDesc).slice(0, 50).map((l) => loanView(l));
  }],
  ["POST", "/loans/:id/vote", ({ db, headers, params, body }) => {
    const user = requireActive(db, headers);
    if (!["for", "against"].includes(body.vote)) fail(400, "Voto invalido. Usa 'for' o 'against'");
    const loan = db.loans.find((l) => l._id === params.id) || fail(404, "Prestamo no encontrado");
    if (loan.status !== "voting") fail(400, "La votacion ya cerro");
    if (loan.user_id === user._id) fail(400, "No puedes votar en tu propio prestamo");
    if (loan.votes_for.includes(user._id) || loan.votes_against.includes(user._id)) fail(400, "Ya votaste en este prestamo");
    (body.vote === "for" ? loan.votes_for : loan.votes_against).push(user._id);
    const eligible = countActive(db) - 1;
    const majority = Math.floor(eligible / 2) + 1;
    let result = { message: "Voto registrado", votes_for: loan.votes_for.length, votes_against: loan.votes_against.length };
    if (loan.votes_for.length >= majority) {
      Object.assign(loan, { status: "active", approved_at: nowIso() });
      result = { message: "Prestamo aprobado por mayoria!", status: "active" };
    } else if (loan.votes_against.length >= majority) {
      Object.assign(loan, { status: "rejected", rejected_at: nowIso() });
      result = { message: "Prestamo rechazado por mayoria.", status: "rejected" };
    }
    save(db);
    return result;
  }],

  // --- Archivos ---
  ["POST", "/upload", async ({ db, headers, body }) => {
    requireActive(db, headers);
    if (!body.file || !("size" in body.file)) fail(400, "Falta el archivo");
    return { url: await fileToCompressedDataUrl(body.file) };
  }],
];

const compiled = routes.map(([method, pattern, handler]) => {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return "/([^/]+)"; }) + "/?$");
  return { method, re, keys, handler };
});

function createInstance() {
  const instance = { defaults: { headers: { common: {} } } };

  const request = async (method, url, data, config = {}) => {
    const [rawPath, rawQuery = ""] = String(url).split("?");
    const idx = rawPath.indexOf("/api");
    const path = idx >= 0 ? rawPath.slice(idx + 4) || "/" : rawPath;
    const query = { ...Object.fromEntries(new URLSearchParams(rawQuery)), ...(config.params || {}) };
    const headers = { ...instance.defaults.headers.common, ...(config.headers || {}) };
    const body = bodyToObject(data);
    for (const r of compiled) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const db = load();
      const result = await r.handler({ db, params, query, body, headers });
      return { status: 200, data: result === undefined ? null : JSON.parse(JSON.stringify(result)) };
    }
    throw new ApiError(404, `Ruta no encontrada: ${method} ${path}`);
  };

  instance.get = (url, config) => request("GET", url, undefined, config);
  instance.delete = (url, config) => request("DELETE", url, undefined, config);
  instance.post = (url, data, config) => request("POST", url, data, config);
  instance.put = (url, data, config) => request("PUT", url, data, config);
  instance.patch = (url, data, config) => request("PATCH", url, data, config);
  return instance;
}

const localApi = { create: () => createInstance() };
export default localApi;
