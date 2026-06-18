const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
let BASE_URL = String(API_BASE_URL).trim();

export async function loginApi(payload: { email: string; password: string }) {
  const cleanBase = BASE_URL.replace(/\/api$/, "");
  const res = await fetch(`${cleanBase}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message || `Login failed (${res.status})`);
  }

  return data;
}