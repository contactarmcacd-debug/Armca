import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
  PRIVATE_FILES: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  EMAIL_API_URL?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  SITE_TIMEZONE?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use("/api/*", cors({ origin: "*", allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"], allowHeaders: ["Content-Type", "Authorization"] }));

const json = (c: any, data: unknown, status = 200) => c.json(data, status);
const id = () => crypto.randomUUID();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return b64(new Uint8Array(digest));
}
async function sign(payload: object, secret: string) {
  const header = b64(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64(new Uint8Array(sig))}`;
}
async function verify(token: string, secret: string): Promise<any | null> {
  try {
    const [h, p, s] = token.split(".");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, fromB64(s), new TextEncoder().encode(`${h}.${p}`));
    const payload = JSON.parse(new TextDecoder().decode(fromB64(p)));
    return ok && payload.exp > Date.now() / 1000 ? payload : null;
  } catch { return null; }
}
async function admin(c: any) {
  const auth = c.req.header("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !c.env.JWT_SECRET) return null;
  return verify(token, c.env.JWT_SECRET);
}
async function requireAdmin(c: any, roles?: string[]) {
  const user = await admin(c);
  if (!user) return { error: json(c, { error: "Authentification requise." }, 401) };
  if (roles && !roles.includes(user.role) && user.role !== "super_admin") return { error: json(c, { error: "Accès non autorisé." }, 403) };
  return { user };
}
async function checkTurnstile(secret: string | undefined, token: string | undefined, ip: string) {
  if (!secret) return true; // En production, configurer le secret pour rendre la vérification obligatoire.
  if (!token) return false;
  const form = new FormData();
  form.append("secret", secret); form.append("response", token); form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const result = await res.json<any>();
  return result.success === true;
}
async function log(db: D1Database, adminId: string, action: string, type?: string, target?: string) {
  await db.prepare("INSERT INTO activity_logs (id, admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?, ?)")
    .bind(id(), adminId, action, type || null, target || null).run();
}
async function sendEmail(env: Bindings, to: string, subject: string, text: string) {
  if (!env.EMAIL_API_URL || !env.EMAIL_API_KEY || !env.EMAIL_FROM) return false;
  const response = await fetch(env.EMAIL_API_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.EMAIL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text })
  });
  return response.ok;
}

app.get("/api/health", c => json(c, { ok: true, service: "ARMCA API", timeZone: c.env.SITE_TIMEZONE || "Africa/Kinshasa" }));

app.get("/api/public/config", c => json(c, { turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null }));

app.get("/api/tenders", async c => {
  const q = (c.req.query("q") || "").trim();
  const status = c.req.query("status") || "published";
  const rows = await c.env.DB.prepare(
    `SELECT id, reference, title, category, description, conditions, required_documents, submission_method, deadline, status, terms_key
     FROM tenders WHERE status = ? AND (title LIKE ? OR reference LIKE ? OR description LIKE ?)
     ORDER BY deadline ASC`
  ).bind(status, `%${q}%`, `%${q}%`, `%${q}%`).all();
  const now = Date.now();
  const items = (rows.results || []).map((t: any) => ({ ...t, computedStatus: new Date(t.deadline).getTime() <= now ? "closed" : t.status }));
  return json(c, { items });
});

app.get("/api/tenders/:id", async c => {
  const item = await c.env.DB.prepare("SELECT * FROM tenders WHERE id = ? AND status = 'published'").bind(c.req.param("id")).first();
  if (!item) return json(c, { error: "Opportunité introuvable." }, 404);
  return json(c, item);
});

app.get("/api/documents", async c => {
  const rows = await c.env.DB.prepare("SELECT id, title, category, description, created_at FROM documents WHERE visibility = 'public' ORDER BY created_at DESC").all();
  return json(c, { items: rows.results || [] });
});

app.get("/api/projects", async c => {
  const rows = await c.env.DB.prepare("SELECT id, title, province, sector, summary, status FROM projects ORDER BY created_at DESC").all();
  return json(c, { items: rows.results || [] });
});
app.get("/api/news", async c => {
  const rows = await c.env.DB.prepare("SELECT id, title, excerpt, body, published_at FROM news WHERE status = 'published' ORDER BY published_at DESC").all();
  return json(c, { items: rows.results || [] });
});

app.post("/api/contact", async c => {
  const body = await c.req.json<any>().catch(() => ({}));
  if (!body.name || !body.email || !body.subject || !body.message) return json(c, { error: "Tous les champs sont obligatoires." }, 400);
  if (!(await checkTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken, c.req.header("CF-Connecting-IP") || ""))) return json(c, { error: "Vérification anti-robot échouée." }, 400);
  await c.env.DB.prepare("INSERT INTO contact_messages (id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)")
    .bind(id(), String(body.name).slice(0,160), String(body.email).slice(0,200), String(body.subject).slice(0,200), String(body.message).slice(0,5000)).run();
  return json(c, { ok: true, message: "Votre message a été transmis." }, 201);
});

app.post("/api/admin/login", async c => {
  const body = await c.req.json<any>().catch(() => ({}));
  if (!body.email || !body.password) return json(c, { error: "Identifiants requis." }, 400);
  const row: any = await c.env.DB.prepare("SELECT id, email, password_hash, role, active FROM admins WHERE email = ?").bind(String(body.email).toLowerCase()).first();
  if (!row || !row.active || await sha256(String(body.password)) !== row.password_hash) return json(c, { error: "Identifiants invalides." }, 401);
  const token = await sign({ sub: row.id, email: row.email, role: row.role, exp: Math.floor(Date.now()/1000) + 60*60*8 }, c.env.JWT_SECRET);
  await log(c.env.DB, row.id, "LOGIN");
  return json(c, { token, user: { id: row.id, email: row.email, role: row.role } });
});

app.get("/api/admin/me", async c => {
  const result = await requireAdmin(c);
  if (result.error) return result.error;
  return json(c, { user: result.user });
});

app.get("/api/admin/applications", async c => {
  const result = await requireAdmin(c, ["super_admin","tenders_manager","evaluator","reader"]);
  if (result.error) return result.error;
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.receipt_number, a.applicant_name, a.email, a.phone, a.status, a.created_at, a.tender_id, t.reference, t.title
     FROM applications a JOIN tenders t ON t.id = a.tender_id ORDER BY a.created_at DESC`
  ).all();
  return json(c, { items: rows.results || [] });
});

app.patch("/api/admin/applications/:id", async c => {
  const result = await requireAdmin(c, ["super_admin","tenders_manager","evaluator"]);
  if (result.error) return result.error;
  const body = await c.req.json<any>().catch(() => ({}));
  const allowed = ["received","under_review","shortlisted","rejected","accepted"];
  if (!allowed.includes(body.status)) return json(c, { error: "Statut invalide." }, 400);
  await c.env.DB.prepare("UPDATE applications SET status = ?, internal_notes = COALESCE(?, internal_notes), evaluator_id = COALESCE(?, evaluator_id) WHERE id = ?")
    .bind(body.status, body.internalNotes || null, body.evaluatorId || null, c.req.param("id")).run();
  await log(c.env.DB, result.user.sub, "UPDATE_APPLICATION", "application", c.req.param("id"));
  return json(c, { ok: true });
});

app.get("/api/admin/export.csv", async c => {
  const result = await requireAdmin(c, ["super_admin","tenders_manager","reader"]);
  if (result.error) return result.error;
  const rows = await c.env.DB.prepare(
    `SELECT receipt_number, applicant_name, email, phone, status, created_at FROM applications ORDER BY created_at DESC`
  ).all();
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["Numero,Nom,Email,Telephone,Statut,Date", ...(rows.results || []).map((r: any) => [r.receipt_number,r.applicant_name,r.email,r.phone,r.status,r.created_at].map(esc).join(","))].join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=armca-candidatures.csv", "Cache-Control": "no-store" } });
});

app.post("/api/admin/tenders", async c => {
  const result = await requireAdmin(c, ["super_admin","tenders_manager"]);
  if (result.error) return result.error;
  const b = await c.req.json<any>().catch(() => ({}));
  if (!b.reference || !b.title || !b.description || !b.deadline || !b.category) return json(c, { error: "Champs obligatoires manquants." }, 400);
  const tid = id();
  await c.env.DB.prepare("INSERT INTO tenders (id, reference, title, category, description, conditions, required_documents, submission_method, deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(tid, b.reference, b.title, b.category, b.description, b.conditions || "", b.requiredDocuments || "", b.submissionMethod || "", b.deadline, b.status || "published").run();
  await log(c.env.DB, result.user.sub, "CREATE_TENDER", "tender", tid);
  return json(c, { id: tid }, 201);
});

app.post("/api/applications", async c => {
  const body = await c.req.json<any>().catch(() => ({}));
  if (!body.tenderId || !body.name || !body.email) return json(c, { error: "Nom, e-mail et appel sont obligatoires." }, 400);
  if (!(await checkTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken, c.req.header("CF-Connecting-IP") || ""))) return json(c, { error: "Vérification anti-robot échouée." }, 400);
  const tender: any = await c.env.DB.prepare("SELECT id, deadline, status FROM tenders WHERE id = ?").bind(body.tenderId).first();
  if (!tender || tender.status !== "published" || new Date(tender.deadline).getTime() <= Date.now()) return json(c, { error: "Cet appel est fermé." }, 409);
  if (!Array.isArray(body.files) || body.files.length > 8) return json(c, { error: "Nombre de fichiers invalide." }, 400);
  const fileRefs: any[] = [];
  let total = 0;
  for (const file of body.files) {
    if (!file.name || !file.contentBase64 || !file.type) return json(c, { error: "Fichier invalide." }, 400);
    const raw = atob(String(file.contentBase64));
    total += raw.length;
    if (raw.length > 8 * 1024 * 1024 || total > 20 * 1024 * 1024) return json(c, { error: "Taille maximale dépassée (8 Mo par fichier, 20 Mo au total)." }, 413);
    const allowed = ["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type)) return json(c, { error: "Format non autorisé. Utilisez PDF ou Word." }, 400);
    const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0));
    const key = `applications/${tender.id}/${id()}`;
    await c.env.PRIVATE_FILES.put(key, bytes, { httpMetadata: { contentType: file.type } });
    fileRefs.push({ key, name: String(file.name).slice(0,180), type: file.type, size: bytes.length });
  }
  const receipt = `ARMCA-${new Date().getFullYear()}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
  await c.env.DB.prepare("INSERT INTO applications (id, receipt_number, tender_id, applicant_name, email, phone, message, files_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id(), receipt, tender.id, String(body.name).slice(0,160), String(body.email).slice(0,200), String(body.phone || "").slice(0,50), String(body.message || "").slice(0,3000), JSON.stringify(fileRefs)).run();
  const sent = await sendEmail(c.env, String(body.email), "Accusé de réception ARMCA", `Votre dossier a été reçu. Numéro de réception : ${receipt}.`);
  return json(c, { ok: true, receiptNumber: receipt, emailSent: sent }, 201);
});

app.get("/api/admin/applications/:id/files/:index", async c => {
  const result = await requireAdmin(c, ["super_admin","tenders_manager","evaluator"]);
  if (result.error) return result.error;
  const row: any = await c.env.DB.prepare("SELECT files_json FROM applications WHERE id = ?").bind(c.req.param("id")).first();
  if (!row) return json(c, { error: "Dossier introuvable." }, 404);
  const files = JSON.parse(row.files_json || "[]");
  const file = files[Number(c.req.param("index"))];
  if (!file) return json(c, { error: "Fichier introuvable." }, 404);
  const obj = await c.env.PRIVATE_FILES.get(file.key);
  if (!obj) return json(c, { error: "Fichier absent." }, 404);
  return new Response(obj.body, { headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});

app.get("/api/admin/logs", async c => {
  const result = await requireAdmin(c, ["super_admin","reader"]);
  if (result.error) return result.error;
  const rows = await c.env.DB.prepare("SELECT action, target_type, target_id, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 200").all();
  return json(c, { items: rows.results || [] });
});

app.all("/api/*", c => json(c, { error: "Route API introuvable." }, 404));
app.get("*", c => c.env.ASSETS.fetch(c.req.raw));
export default app;
