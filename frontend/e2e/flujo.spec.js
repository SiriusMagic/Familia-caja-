// Flujo real en el navegador: registro, aprobación y pago con comprobante.
import { expect, test } from "@playwright/test";
import zlib from "node:zlib";

// PNG rojo de 300x200 generado en memoria (comprobante de prueba).
function pngComprobante() {
  const w = 300, h = 200;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w * 3 + 1) + 1 + x * 3] = 200;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("registro, aprobación y pago con comprobante", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const T = (id) => page.getByTestId(id);

  const register = async (name, email) => {
    if (!(await T("register-name").isVisible())) await T("toggle-auth-mode").click();
    await T("register-name").fill(name);
    await T("login-email").fill(email);
    await T("login-password").fill("clave123");
    await T("auth-submit-btn").click();
    await expect(T("auth-success")).toBeVisible();
    if (await T("register-name").isVisible()) await T("toggle-auth-mode").click();
  };
  const login = async (email) => {
    await T("login-email").fill(email);
    await T("login-password").fill("clave123");
    await T("auth-submit-btn").click();
    await T("nav-home").click();
  };
  const logout = async () => { await T("nav-profile").click(); await T("logout-btn").click(); };

  await page.goto("./");
  await register("Ana Admin", "ana@x.com");
  await expect(T("auth-success")).toContainText("administrador");
  await register("Beto Socio", "beto@x.com");

  await login("ana@x.com");
  await expect(T("admin-dashboard")).toContainText("Socios Pendientes");
  await page.getByRole("button", { name: /aprobar/i }).first().click();
  await logout();

  await login("beto@x.com");
  await expect(T("socio-dashboard")).toContainText("Hola, Beto");
  await T("upload-receipt-btn").click();
  await T("payment-amount").fill("75");
  await T("payment-note").fill("Octubre");
  await T("payment-file").setInputFiles({ name: "comprobante.png", mimeType: "image/png", buffer: pngComprobante() });
  await T("submit-payment-btn").click();
  await logout();

  await login("ana@x.com");
  await expect(T("admin-dashboard")).toContainText("$75.00");
  if (!process.env.VITE_SUPABASE_URL) {
    // Modo local: el comprobante se guarda comprimido en este navegador.
    const receipt = await page.evaluate(() => JSON.parse(localStorage.getItem("ahorro-familiar-db-v1")).payments[0].receipt_image);
    expect(receipt.startsWith("data:image/jpeg;base64,")).toBe(true);
  }
  expect(errors).toEqual([]);
});
