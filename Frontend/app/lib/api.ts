/**
 * Thin fetch wrapper used by lib-level callers (e.g. direct loginApi before AuthContext is ready).
 * Uses the same VITE_API_BASE_URL env variable as apiService.ts.
 */
const _API_BASE: string = (
  String(import.meta.env.VITE_API_BASE_URL ?? "").trim() || "http://localhost:5000"
).replace(/\/api$/, "").replace(/\/+$/, "");

export async function loginApi(payload: { email: string; password: string }) {
  const url = `${_API_BASE}/api/auth/login`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    console.error("Login API error:", networkErr);
    throw networkErr;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("Login API error:", data);
    throw new Error(data?.message || `Login failed (${res.status})`);
  }

  return data;
}