# Google Sign-In (NextAuth) Setup

This app supports **Sign in with Google** so that (in the future) listening stats can be saved to your Google Drive. You only need to set this up if you want to use Google Login.

## 1. Create OAuth credentials in Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Enable the **Google Drive API**:  
   APIs & Services → Library → search "Google Drive API" → Enable.
4. Go to **APIs & Services → Credentials**.
5. Click **Create Credentials** → **OAuth client ID**.
6. If asked, configure the **OAuth consent screen**:
   - User type: **External** (or Internal for workspace only).
   - Fill App name, User support email, Developer contact.
   - Scopes: add `.../auth/drive.file` (or leave default and add later).
   - Save.
7. Application type: **Web application**.
8. Name: e.g. "DropList".
9. **Authorized redirect URIs** — add:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-domain.com/api/auth/callback/google` (production)
10. Create. Copy the **Client ID** and **Client secret**.

## 2. Environment variables

Add to `.env.local` (do not commit this file):

```bash
# Required for NextAuth
NEXTAUTH_SECRET=your_random_secret_here
NEXTAUTH_URL=http://localhost:3000

# From Google Cloud OAuth client
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
```

- **NEXTAUTH_SECRET**: Generate a random string, e.g. `openssl rand -base64 32`.
- **NEXTAUTH_URL**: Use `http://localhost:3000` for local dev; use your real URL in production.

## 3. Run the app

Restart the dev server after changing env:

```bash
npm run dev
```

Open the sidebar and click **Sign in with Google**. After signing in, the app has permission to create/update files in your Drive (scope `drive.file` = only files the app creates). This will be used later for saving listening statistics to a JSON file in your Drive.
