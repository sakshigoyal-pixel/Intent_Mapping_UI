# Deployment Guide — VideoAnnotate

## Step 1: Create MongoDB Atlas (Free Database)

1. Go to https://mongodb.com/atlas and sign up
2. Click **Build a Database** → choose **FREE (M0)**
3. Pick any cloud provider/region
4. Set a database username and password (save these!)
5. In **Network Access**, click **Add IP Address** → **Allow Access from Anywhere**
6. Click **Connect** → **Drivers** → copy the connection string
7. It looks like: `mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/videoannotate`

## Step 2: Deploy Backend on Render (Free)

1. Push the `intent_mapping/server` folder to a GitHub repo
2. Go to https://render.com and sign up with GitHub
3. Click **New** → **Web Service**
4. Connect your GitHub repo, set **Root Directory** to `server`
5. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
6. Add Environment Variable:
   - Key: `MONGODB_URI`
   - Value: your MongoDB connection string from Step 1
7. Click **Deploy**
8. Note your backend URL (e.g. `https://videoannotate-api.onrender.com`)

## Step 3: Deploy Frontend on Vercel (Free)

1. Push the `intent_mapping/client` folder to a GitHub repo
2. Go to https://vercel.com and sign up with GitHub
3. Click **New Project** → import your repo
4. Set **Root Directory** to `client`
5. Add Environment Variable:
   - Key: `VITE_API_URL`
   - Value: `https://YOUR-RENDER-URL.onrender.com/api`
6. Click **Deploy**
7. Your app is live at `https://your-app.vercel.app`

## Local Development

No MongoDB needed locally — it falls back to `db.json` automatically.

```bash
# Backend
cd intent_mapping/server
npm install
node index.js

# Frontend (new terminal)
cd intent_mapping/client
npm install
npm run dev
```

## Environment Variables Summary

### Backend (Render)
| Variable | Value |
|----------|-------|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/videoannotate` |
| `PORT` | `5001` (Render sets this automatically) |

### Frontend (Vercel)
| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-render-url.onrender.com/api` |
