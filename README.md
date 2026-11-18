# ARBOX Garage — iPhone Home Screen PWA

## What is included
A polished standalone web app, 21-entry starting checklist, editable Owned/Ordered/Missing status, local backup, optional Supabase cloud sync with email sign-in, a daily GitHub Actions announcement scanner, a review feed, and optional native iPhone web push notifications. Car artwork is illustrative (not verified model photographs). Release radar entries are **unverified news leads** and never automatically marked Released.

## Setup (about 20–40 minutes, requires accounts)

### 1. Supabase — private cloud database
1. Create a project at https://supabase.com/ .
2. Open **SQL Editor**, paste and run `schema.sql` **once**. If you need to rerun it, delete duplicate policies or adjust `CREATE POLICY` accordingly.
3. In **Project Settings → API Keys**, copy your **publishable/anon key** and project URL. Put ONLY those in `config.js` as `supabaseAnonKey` and `supabaseUrl`. NEVER put your service-role key in config.js.
4. Under **Authentication → URL Configuration**, add your future GitHub Pages URL as Site URL and Redirect URL (e.g. `https://YOURNAME.github.io/arbox-garage/`). Email sign-in must be enabled.

### 2. GitHub — hosting and daily scanner
1. Create a GitHub repository named `arbox-garage` (public is simplest for free GitHub Pages). Upload all files and folders **including `.github/workflows/release-radar.yml`** to the repository root. A public repository means app code is public, but private collection data is protected by Supabase RLS.
2. In repository **Settings → Pages**, set **Deploy from a branch**, `main`, root `/`. Wait for your HTTPS site URL.
3. In **Settings → Secrets and variables → Actions**, add repository secrets:
   - `SUPABASE_URL`: project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase secret/service-role key. **Secret only, never in the website.**
   - `VAPID_PRIVATE_KEY`: optional private Web Push VAPID key
   - `VAPID_EMAIL`: optional sender contact email (without `mailto:`)
4. Under **Actions**, manually run **ARBOX release radar** once to test; then it runs daily at 02:17 UTC (09:17 Bangkok), subject to GitHub scheduling delays and public source availability.

### 3. iPhone install
Open the HTTPS GitHub Pages URL in Safari → Share → **Add to Home Screen** → enable **Open as Web App** → Add. Launch the icon, sign in with your email link, and confirm cloud sync.

### 4. Optional genuine iPhone push alerts
1. Generate a VAPID key pair using a trusted Web Push VAPID key generator or locally using a library such as `py_vapid` (keep the private key secret).
2. Put the **public** VAPID key in `config.js` as `vapidPublicKey`.
3. Put the **private** key in GitHub Actions secret `VAPID_PRIVATE_KEY`, and a contact email in `VAPID_EMAIL`.
4. Revisit the installed iPhone Home Screen app and tap **Enable iPhone push alerts**; allow notifications.
5. When the scheduled scan discovers a **new** lead, it will send a push alert. Initial historical matches may cause a batch of alerts. iOS push requires the app installed to Home Screen and notification permission.

## Data and accuracy limitations
- This is a starter checklist from our conversation, not a complete verified Almost Real product catalogue. Some chase variants are explicitly flagged **Unverified**.
- The daily scanner uses Google News RSS queries and can miss announcements, return old articles, or encounter source outages. It records matching titles as `TBA / review`, not verified release status. It does not automatically add unverified leads as products.
- Release statuses in `catalog.json` are initial working labels, not real-time confirmed stock or launch dates. To edit or add a model, update `catalog.json` and redeploy. Existing user ownership statuses are preserved in Supabase.
- Push subscriptions are stored privately in Supabase and read by the GitHub workflow using its service-role secret.
- With no Supabase config, the app works as a local-device preview only; no cloud sync or automatic release feed.
- Supabase free projects can pause due to inactivity and GitHub scheduled workflows can be delayed/disabled; review your service dashboards occasionally.
