// Conexión a la base compartida en Supabase.
//
// Expone las mismas rutas (/api/...) y la misma forma que localApi.js, así las
// pantallas no cambian. Las reglas de seguridad NO están aquí sino en la base de
// datos (supabase/schema.sql): este archivo solo traduce cada ruta a una llamada.

const BUCKET = "comprobantes";

class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.response = { status, data: { detail } };
  }
}
const fail = (status, detail) => {
  throw new ApiError(status, detail);
};

// Error de Supabase/PostgreSQL → error con el formato que esperan las pantallas.
function toApiError(error) {
  const code = error?.code || "";
  const status =
    code === "42501" ? 403 : code === "28000" || code === "PGRST301" ? 401 : code === "P0002" ? 404 : error?.status || 400;
  return new ApiError(status, error?.message || "Algo salio mal. Intenta de nuevo.");
}

function bodyToObject(data) {
  if (data == null) return {};
  if (typeof FormData !== "undefined" && data instanceof FormData) return Object.fromEntries(data.entries());
  return data;
}

// Reduce la foto del comprobante a máx. 1600 px en JPEG antes de subirla.
async function compressImage(file) {
  if (file.size > 5 * 1024 * 1024) fail(400, "Archivo muy grande (max 5MB)");
  if (!file.type?.startsWith("image/") || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob || file;
  } catch {
    return file;
  }
}

const hasFile = (f) => f && typeof f === "object" && "size" in f && f.size > 0;

export function createSupabaseApi(supabase) {
  const rpc = async (name, args) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw toApiError(error);
    return data;
  };

  const myProfile = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) fail(401, "No autenticado");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", auth.user.id).single();
    if (error) throw toApiError(error);
    return { _id: data.id, email: data.email, name: data.name, role: data.role, status: data.status, cedula: data.cedula, phone: data.phone };
  };

  const uploadReceipt = async (file) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) fail(401, "No autenticado");
    const blob = await compressImage(file);
    const ext = blob.type === "image/jpeg" ? "jpg" : (file.name?.split(".").pop() || "bin").toLowerCase();
    const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type });
    if (error) throw toApiError(error);
    return path;
  };

  const routes = [
    ["GET", "/", () => ({ message: "AhorroFamiliar API (Supabase)" })],

    // --- Auth ---
    ["POST", "/auth/register", async ({ body }) => {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !body.password || !body.name) fail(400, "Completa nombre, correo y contraseña");
      const { data, error } = await supabase.auth.signUp({
        email,
        password: String(body.password),
        options: { data: { name: String(body.name).trim(), cedula: String(body.cedula || "").trim(), phone: String(body.phone || "").trim() } },
      });
      if (error) throw toApiError(error);
      // Supabase no avisa directamente si el correo ya existe (para no revelar cuentas).
      if (data.user && data.user.identities?.length === 0) fail(400, "Este correo ya esta registrado");
      let message = "Revisa tu correo para confirmar la cuenta. Después el administrador debe aprobarte.";
      if (data.session) {
        const me = await myProfile();
        message = me.status === "active"
          ? "Eres el primer usuario: tu cuenta es de administrador y ya está activa. Inicia sesión."
          : "Tu cuenta espera aprobacion del administrador";
        await supabase.auth.signOut();
      }
      return { message, user_id: data.user?.id, status: "pending" };
    }],
    ["POST", "/auth/login", async ({ body }) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(body.email || "").trim().toLowerCase(),
        password: String(body.password || ""),
      });
      if (error) {
        if (/confirm/i.test(error.message)) fail(403, "Confirma tu correo antes de entrar (revisa tu bandeja)");
        if (error.status === 429) fail(429, "Demasiados intentos. Intenta mas tarde.");
        fail(401, "Correo o contrasena incorrectos");
      }
      const user = await myProfile();
      const blocked = { pending: "Tu cuenta espera aprobacion del administrador", rejected: "Tu cuenta ha sido rechazada", suspended: "Tu cuenta ha sido suspendida" };
      if (blocked[user.status]) {
        await supabase.auth.signOut();
        fail(403, blocked[user.status]);
      }
      const { data } = await supabase.auth.getSession();
      return { access_token: data.session?.access_token, user };
    }],
    ["POST", "/auth/logout", async () => {
      await supabase.auth.signOut();
      return { message: "Sesion cerrada" };
    }],
    ["GET", "/auth/me", () => myProfile()],

    // --- Admin ---
    ["GET", "/admin/dashboard", () => rpc("admin_dashboard")],
    ["GET", "/admin/pending-users", () => rpc("admin_users", { p_only_pending: true })],
    ["POST", "/admin/users/:id/approve", async ({ params }) => {
      await rpc("admin_review_user", { p_user_id: params.id, p_approve: true });
      return { message: "Usuario aprobado exitosamente" };
    }],
    ["POST", "/admin/users/:id/reject", async ({ params }) => {
      await rpc("admin_review_user", { p_user_id: params.id, p_approve: false });
      return { message: "Usuario rechazado" };
    }],
    ["POST", "/admin/users/:id/role", async ({ params, body }) => {
      await rpc("admin_set_role", { p_user_id: params.id, p_role: body.role });
      return { message: `Rol cambiado a ${body.role}` };
    }],
    ["POST", "/admin/users/:id/reset-password", () =>
      // Cambiar la contraseña de otra persona necesita la llave secreta, que nunca va en el navegador.
      fail(400, "Con la base compartida, cambia la contraseña desde Supabase: Authentication → Users → el socio → Send password recovery.")],
    ["GET", "/admin/payments/pending", () => rpc("admin_pending_payments")],

    // --- Usuarios ---
    ["GET", "/users", () => rpc("admin_users", { p_only_pending: false })],
    ["GET", "/users/me/summary", () => rpc("my_summary")],

    // --- Pagos ---
    ["POST", "/payments", async ({ body }) => {
      const amount = Number(body.amount);
      if (!(amount > 0)) fail(400, "Monto invalido");
      const receipt = hasFile(body.receipt) ? await uploadReceipt(body.receipt) : null;
      const id = await rpc("create_payment", { p_amount: amount, p_type: body.type || "ahorro", p_note: body.note || "", p_receipt_path: receipt });
      return { message: "Pago enviado para aprobacion", payment_id: id };
    }],
    ["GET", "/payments/my", () => rpc("my_payments")],
    ["POST", "/payments/:id/approve", async ({ params }) => {
      await rpc("admin_review_payment", { p_payment_id: params.id, p_approve: true });
      return { message: "Pago aprobado" };
    }],
    ["POST", "/payments/:id/reject", async ({ params }) => {
      await rpc("admin_review_payment", { p_payment_id: params.id, p_approve: false });
      return { message: "Pago rechazado" };
    }],

    // --- Préstamos ---
    ["POST", "/loans", async ({ body }) => {
      const id = await rpc("request_loan", { p_amount: Number(body.amount), p_purpose: String(body.purpose || ""), p_description: body.description || "" });
      return { message: "Solicitud de prestamo creada. Los socios votaran.", loan_id: id };
    }],
    ["GET", "/loans", () => rpc("list_loans", { p_only_mine: false })],
    ["GET", "/loans/my", () => rpc("list_loans", { p_only_mine: true })],
    ["POST", "/loans/:id/vote", ({ params, body }) => rpc("vote_loan", { p_loan_id: params.id, p_vote: body.vote })],

    // --- Archivos ---
    ["POST", "/upload", async ({ body }) => {
      if (!hasFile(body.file)) fail(400, "Falta el archivo");
      return { url: await uploadReceipt(body.file) };
    }],
  ];

  const compiled = routes.map(([method, pattern, handler]) => {
    const keys = [];
    const re = new RegExp("^" + pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return "/([^/]+)"; }) + "/?$");
    return { method, re, keys, handler };
  });

  const instance = { defaults: { headers: { common: {} } } };
  const request = async (method, url, data) => {
    const rawPath = String(url).split("?")[0];
    const idx = rawPath.indexOf("/api");
    const path = idx >= 0 ? rawPath.slice(idx + 4) || "/" : rawPath;
    for (const r of compiled) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const result = await r.handler({ params, body: bodyToObject(data) });
      return { status: 200, data: result ?? null };
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
