
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import ApiService from "./app/api/apiService";

async function init() {
  const hostname = window.location.hostname;

  // Do not resolve if running on localhost or main vercel domain. But to support localhost testing if needed,
  // we can still call the API. The API handles 'localhost' properly (will return 404 and we show default).
  try {
    // Call backend resolve API
    const res = await ApiService.get(`/api/custom-domains/resolve?domain=${hostname}`);
    if (res.success && res.data && res.data.client) {
      console.log("[Frontend] Custom domain resolved for client:", res.data.client.companyName || res.data.client.shopName);
      localStorage.setItem("retail_verse_client_id", res.data.client._id);
      localStorage.setItem("retail_verse_domain_data", JSON.stringify(res.data));
    } else {
      localStorage.removeItem("retail_verse_client_id");
      localStorage.removeItem("retail_verse_domain_data");
    }
  } catch (error) {
    // If 404 or network error, fallback to default site
    localStorage.removeItem("retail_verse_client_id");
    localStorage.removeItem("retail_verse_domain_data");
  }

  createRoot(document.getElementById("root")!).render(<App />);
}

init();
