let BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://omni-commerce-website.onrender.com/api";
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
if (!isLocalhost && (BASE_URL.includes("localhost") || BASE_URL.includes("127.0.0.1"))) {
  BASE_URL = "https://omni-commerce-website.onrender.com/api";
}

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