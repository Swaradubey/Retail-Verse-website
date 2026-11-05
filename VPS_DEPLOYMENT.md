# Deploy Retail Verse to the VPS (129.121.168.92), separate from the existing project

| Piece      | Where it lives                                   | Separation from the other project            |
|------------|--------------------------------------------------|----------------------------------------------|
| Code       | `/home/retailverse/app`                          | Separate Linux user `retailverse`            |
| Frontend   | `app/dist`, served by Nginx                      | Its own Nginx site file, matched by domain   |
| Backend    | Node on `127.0.0.1:5050`, PM2 `retailverse-api`  | Its own nvm Node and its own PM2 process     |
| Database   | Docker `retailverse-mongo` on `127.0.0.1:27018`  | Separate MongoDB instance and data volume    |
| Secrets    | `/home/retailverse/backend.env`                  | Readable only by `retailverse` (chmod 600)   |
| Uploads    | `/home/retailverse/data/uploads`                 | Kept across redeploys                        |

## 0. DNS (at the retailverse.in domain registrar)
| Type | Name  | Value            |
|------|-------|------------------|
| A    | `@`   | `129.121.168.92` |
| A    | `www` | `129.121.168.92` |

Remove any old A/CNAME records for `@`/`www` (e.g. Vercel's `76.76.21.21` / `cname.vercel-dns.com`).
Check with `nslookup retailverse.in`. It must show `129.121.168.92` before step 2, or the SSL step fails.

## 1. Package the code (on Windows, in PowerShell)
```powershell
cd C:\Users\Dell\Downloads\Retail-Verse-website-main\Retail-Verse-website-main
tar --exclude=node_modules --exclude=dist --exclude=.env --exclude=Backend/uploads --exclude=tmp -czf ..\retailverse.tar.gz .
scp ..\retailverse.tar.gz root@129.121.168.92:/tmp/
```

## 2. First-time setup (SSH in, or use Bluehost "Open Terminal")
```bash
mkdir -p /tmp/rv && tar -xzf /tmp/retailverse.tar.gz -C /tmp/rv
sudo bash /tmp/rv/deploy/00-inspect.sh            # read-only: check what's already running
sudo DOMAIN=retailverse.in EMAIL=hexerve@gmail.com bash /tmp/rv/deploy/01-setup-server.sh
sudo -u retailverse -H bash /tmp/rv/deploy/deploy.sh /tmp/retailverse.tar.gz
```
If port 5050 or 27018 is already taken, add `BACKEND_PORT=5051` or `MONGO_PORT=27019` to the setup command.

## 3. Add your API keys
```bash
sudo nano /home/retailverse/backend.env           # SMTP, Razorpay, Google, Gemini/OpenAI...
sudo -u retailverse -H bash /home/retailverse/deploy.sh --restart-only
```
To use the frontend Razorpay key, add `VITE_RAZORPAY_KEY_ID=...` to `/home/retailverse/frontend.env`, then redeploy (step 4). Frontend variables are baked in at build time.

## 4. Later updates: deploy from GitHub (recommended)

Source: https://github.com/Swaradubey/Retail-Verse-website (public, branch `main`).
The deploy tools (`deploy.sh`, `ecosystem.config.cjs`) live in `/home/retailverse/`, outside the app, so the repo doesn't need to contain them.

### One-time setup
From PowerShell on your PC (in this project folder):
```powershell
scp deploy\deploy.sh deploy\ecosystem.config.cjs root@129.121.168.92:/tmp/
```
On the VPS:
```bash
install -o retailverse -g retailverse -m 755 /tmp/deploy.sh /home/retailverse/deploy.sh
install -o retailverse -g retailverse -m 644 /tmp/ecosystem.config.cjs /home/retailverse/ecosystem.config.cjs
sudo -u retailverse -H git clone https://github.com/Swaradubey/Retail-Verse-website.git /home/retailverse/repo
```
If the repo is ever made **private**, add a read-only deploy key (repo Settings → Deploy keys) and switch the remote to `git@github.com:Swaradubey/Retail-Verse-website.git`.

### Every update
1. The developer pushes to `main` on GitHub.
2. Deploy with one command from PowerShell on your PC:
   ```powershell
   ssh root@129.121.168.92 "sudo -u retailverse -H bash /home/retailverse/deploy.sh --git"
   ```
   (Or run the part in quotes directly on the VPS. Add a branch name after `--git` to deploy another branch.)

The deploy script waits if an HRMS build is running, keeps the previous version in `~/app-old`, and prints how to roll back.

### Fallback: upload a tarball (no GitHub)
Repeat step 1, then:
```bash
sudo -u retailverse -H bash /home/retailverse/deploy.sh /tmp/retailverse.tar.gz
```

## Check it works
- https://retailverse.in should load the site.
- https://retailverse.in/api/health should return JSON.
- Google login: in Google Cloud Console, add `https://retailverse.in/auth/google/callback` as an authorized redirect URI.

## Useful commands
```bash
sudo -u retailverse -H bash -lc 'pm2 ls; pm2 logs retailverse-api --lines 100'
docker logs retailverse-mongo --tail 50
sudo -u retailverse cat /home/retailverse/.secrets   # Mongo admin password
# Mongo backup:
docker exec retailverse-mongo sh -c 'mongodump -u rvadmin -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive' > rv-$(date +%F).archive
```

## Moving existing data from MongoDB Atlas (optional)
```bash
docker exec -i retailverse-mongo mongodump --uri "<ATLAS_URI>" --archive > /tmp/atlas.archive
docker exec -i retailverse-mongo sh -c 'mongorestore -u rvadmin -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --nsFrom "<atlasDbName>.*" --nsTo "retailverse.*" --archive' < /tmp/atlas.archive
```

