# Production Deployment Environment Variables

## Vercel (Frontend)
Set these environment variables in your Vercel project settings:

```env
# The URL of your backend on Render (or other host)
VITE_API_URL=https://your-backend-url.onrender.com/api

# Optional: if you want to use a specific retail verse client context by default
# VITE_DEFAULT_CLIENT_ID=your_client_id
```

## Render (Backend)
Set these environment variables in your Render service settings:

```env
# The URL of your frontend on Vercel
CLIENT_ORIGIN=https://your-frontend-url.vercel.app,http://localhost:5173

# Standard configuration
NODE_ENV=production
MONGO_URI=your_mongodb_atlas_uri
JWT_SECRET=your_secure_random_jwt_secret

# ─── Forgot Password / Email (Nodemailer) ─────────────────────────────────
# FRONTEND_URL is used in password reset email links — must be the EXACT
# production frontend domain (no trailing slash). Example:
FRONTEND_URL=https://your-frontend-url.vercel.app

# SMTP (Nodemailer) — required for forgot-password and invoice emails
SMTP_HOST=smtp.gmail.com              # or smtp-relay.brevo.com, etc.
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-email@gmail.com
SMTP_PASS=your-app-password           # Gmail App Password, Brevo SMTP key, etc.
SMTP_FROM=your-smtp-email@gmail.com   # verified sender address
# EMAIL_FROM=your-smtp-email@gmail.com  # alternative alias for SMTP_FROM

# Optional: Shiprocket credentials for tracking
# SHIPROCKET_EMAIL=your_email
# SHIPROCKET_PASSWORD=your_password
```

## Troubleshooting
- **CORS Errors**: Ensure `CLIENT_ORIGIN` on the backend matches the exact URL of your frontend (no trailing slash).
- **Blank Dashboard**: Check if `VITE_API_URL` is correctly set and includes `/api` at the end (the system handles both, but `/api` is recommended).
- **Authentication**: The token is stored in `eco_shop_token` in localStorage. Ensure your browser is not blocking third-party storage if accessing via an iframe.
