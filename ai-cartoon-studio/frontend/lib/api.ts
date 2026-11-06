export type Json = any;
const KEY = "acs_token";
export const getToken = () => (typeof window === "undefined" ? "" : localStorage.getItem(KEY) || "");
export const setToken = (t: string) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export class ApiError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }

async function req(method: string, path: string, body?: Json, form?: FormData): Promise<Json> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`/api${path}`, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  if (r.status === 401 && tok && !path.startsWith("/auth/login")) { setToken(""); if (typeof window !== "undefined") window.location.href = "/login"; }
  if (!r.ok) {
    let d: Json = {}; try { d = await r.json(); } catch {}
    const detail = typeof d.detail === "string" ? d.detail : Array.isArray(d.detail) ? d.detail.map((x: Json) => x.msg).join(", ") : `HTTP ${r.status}`;
    throw new ApiError(r.status, detail);
  }
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : r;
}
export const api = {
  get: (p: string) => req("GET", p), post: (p: string, b?: Json) => req("POST", p, b ?? {}), patch: (p: string, b: Json) => req("PATCH", p, b),
  put: (p: string, b: Json) => req("PUT", p, b), del: (p: string) => req("DELETE", p), upload: (p: string, f: FormData) => req("POST", p, undefined, f),
};
/** <img>/<video>/<audio> cannot send headers, so media URLs carry the session token as a query parameter. */
export const media = (url: string) => `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(getToken())}`;
export async function download(path: string, name: string, method = "GET") {
  const r: Response = await (method === "POST" ? req("POST", path, {}) : req("GET", path));
  const blob = await r.blob(); const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
export const fmtBytes = (n: number) => (n > 1e9 ? (n / 1e9).toFixed(2) + " GB" : n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : (n / 1e3).toFixed(0) + " KB");
