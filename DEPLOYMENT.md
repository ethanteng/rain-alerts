# Deployment Guide

## Quick Deploy to Vercel

### Step 1: Login to Vercel
```bash
vercel login
```
This will open your browser for authentication.

### Step 2: Deploy
```bash
vercel
```
Follow the prompts:
- Link to existing project? **No** (for first deployment)
- Project name: **rain-alerts** (or your preferred name)
- Directory: **./** (current directory)
- Override settings? **No**

### Step 3: Set Environment Variables

After deployment, go to your Vercel dashboard:
1. Navigate to your project
2. Go to **Settings** → **Environment Variables**
3. Add the following variables (for Production, Preview, and Development):

```
RESEND_API_KEY=re_your_api_key_here
SENDER_EMAIL=your-verified-email@yourdomain.com
ALERT_EMAIL=your-alert-email@example.com
LOCATION_LATITUDE=37.8044
LOCATION_LONGITUDE=-122.2708
PRECIPITATION_THRESHOLD_INCHES=0.5
```

### Step 4: Redeploy (if needed)

After adding environment variables, trigger a new deployment:
```bash
vercel --prod
```

Or redeploy from the Vercel dashboard.

## Cron Job Configuration

The cron job is configured in `vercel.json` to run daily at 9:00 AM UTC. It will automatically start running after deployment.

To test the function manually, visit:
```
https://your-project.vercel.app/api/check-precipitation
```

## Troubleshooting

- **Function not found**: Make sure `api/check-precipitation.ts` exists and is committed
- **Environment variables not working**: Ensure they're set for the correct environment (Production/Preview/Development)
- **Cron not running**: Check the Vercel dashboard → Cron Jobs section to see execution logs
