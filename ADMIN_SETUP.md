# Skiframes Admin Setup Guide

This guide walks you through setting up the admin panel with Cloudflare Access + Google SSO.

## Overview

- **Admin page**: `/admin/` - protected by Cloudflare Access
- **Backend**: Cloudflare Worker - handles S3 deletions
- **Auth**: Google SSO via Cloudflare Access (free tier)

---

## Step 1: Enable Cloudflare Zero Trust (5 min)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **Zero Trust** in the left sidebar
3. If first time, you'll be prompted to set up a team name (e.g., `skiframes`)
4. Choose the **Free** plan (up to 50 users)

---

## Step 2: Add Google as Identity Provider (5 min)

1. In Zero Trust dashboard, go to **Settings** > **Authentication**
2. Under **Login methods**, click **Add new**
3. Select **Google**
4. You'll need Google OAuth credentials:

### Create Google OAuth Credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Go to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth Client ID**
5. If prompted, configure the OAuth consent screen first:
   - User Type: External
   - App name: Skiframes Admin
   - Add your email as a test user
6. For OAuth Client ID:
   - Application type: **Web application**
   - Name: Cloudflare Access
   - Authorized redirect URI: `https://YOUR_TEAM_NAME.cloudflareaccess.com/cdn-cgi/access/callback`
   - Replace YOUR_TEAM_NAME with your Zero Trust team name
7. Copy the **Client ID** and **Client Secret**
8. Paste them in the Cloudflare Zero Trust Google configuration
9. Click **Save**

---

## Step 3: Create Access Application (3 min)

1. In Zero Trust, go to **Access** > **Applications**
2. Click **Add an application**
3. Select **Self-hosted**
4. Configure:
   - **Application name**: Skiframes Admin
   - **Session duration**: 24 hours (or your preference)
   - **Application domain**: `skiframes.com`
   - **Path**: `/admin/*`
5. Click **Next**
6. Create a policy:
   - **Policy name**: Admin Access
   - **Action**: Allow
   - **Include**: Emails - enter your Google email
7. Click **Next**, then **Add application**

**Important**: Copy the **Application Audience (AUD) Tag** - you'll need it for the worker.

---

## Step 4: Deploy the Cloudflare Worker (5 min)

### Install Wrangler (if not already installed):

```bash
npm install -g wrangler
```

### Login to Cloudflare:

```bash
wrangler login
```

### Update worker configuration:

Edit `workers/admin-api/wrangler.toml`:

```toml
[vars]
CF_ACCESS_TEAM = "your-team-name"  # The team name from Step 1
```

### Set secrets:

```bash
cd workers/admin-api

# Your AWS credentials (need S3 write access to avillachlab-netm)
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY

# The AUD tag from Step 3
wrangler secret put CF_ACCESS_AUD
```

### Deploy:

```bash
wrangler deploy
```

Note the worker URL (e.g., `https://skiframes-admin.YOUR_SUBDOMAIN.workers.dev`)

---

## Step 5: Update Admin Page

Edit `admin/index.html` and update the API_URL:

```javascript
API_URL: 'https://skiframes-admin.YOUR_SUBDOMAIN.workers.dev',
```

---

## Step 6: Deploy Website

```bash
./deploy.sh prod
```

---

## Usage

1. Go to `https://skiframes.com/admin/`
2. You'll be redirected to Cloudflare Access login
3. Click "Login with Google"
4. Sign in with your authorized Google account
5. You're now in the admin panel

### Deleting Content:

1. Click "Load Content" on any event to see videos/photos
2. Check the boxes on items you want to delete
3. Click "Delete Selected" in the bottom bar
4. Confirm the deletion

### Deleting Entire Events:

1. Click "Delete Event" button next to any event
2. Confirm the deletion
3. This removes all content and the manifest

---

## Troubleshooting

### "Unauthorized" error
- Check that your Google email is in the Access policy
- Verify CF_ACCESS_AUD secret matches the Application AUD tag
- Check CF_ACCESS_TEAM matches your team name

### Delete fails
- Verify AWS credentials have S3 write access to `avillachlab-netm`
- Check the worker logs: `wrangler tail`

### CORS errors
- Verify ALLOWED_ORIGIN in wrangler.toml matches your domain
- For testing, you can temporarily set it to `*`

---

## Security Notes

- Cloudflare Access JWT is validated on every request
- AWS credentials are stored as encrypted secrets in Cloudflare
- All traffic is over HTTPS
- Session expires based on your Access Application settings
