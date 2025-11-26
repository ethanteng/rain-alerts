# Rain Alert Monitor

A TypeScript-based precipitation monitoring system that runs daily on Vercel, checks the past 7 days of rainfall for a configurable location, and sends email alerts via Resend when weekly precipitation exceeds a configurable threshold.

## Features

- Daily automated precipitation checks
- Configurable location (latitude/longitude)
- Configurable precipitation threshold
- Email alerts via Resend when threshold is exceeded
- Runs as a Vercel serverless function with cron scheduling

## Setup

### Prerequisites

- Node.js (v18 or higher)
- A Vercel account
- A Resend account with API key
- A verified sender email domain in Resend

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy the environment variables template:

```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:

- `RESEND_API_KEY`: Your Resend API key
- `SENDER_EMAIL`: A verified sender email from Resend
- `ALERT_EMAIL`: The email address to receive alerts
- `LOCATION_LATITUDE`: Location latitude (default: 37.8044 for Oakland)
- `LOCATION_LONGITUDE`: Location longitude (default: -122.2708 for Oakland)
- `PRECIPITATION_THRESHOLD_INCHES`: Precipitation threshold in inches (default: 0.5)

### Local Development

Run the development server:

```bash
npm run dev
```

Test the endpoint manually by visiting:
```
http://localhost:3000/api/check-precipitation
```

### Deployment to Vercel

1. Install Vercel CLI (if not already installed):

```bash
npm i -g vercel
```

2. Deploy to Vercel:

```bash
vercel
```

3. Set environment variables in Vercel dashboard:
   - Go to your project settings
   - Navigate to Environment Variables
   - Add all variables from `.env.example`

4. The cron job is configured to run daily at 9:00 AM UTC (configured in `vercel.json`)

## Configuration

### Cron Schedule

The default schedule is set to run daily at 9:00 AM UTC (`0 9 * * *`). You can modify this in `vercel.json` using cron syntax.

### Location

By default, the monitor checks Oakland, CA (37.8044°N, -122.2708°W). You can change this by setting `LOCATION_LATITUDE` and `LOCATION_LONGITUDE` environment variables.

### Threshold

The default precipitation threshold is 0.5 inches. Change this by setting `PRECIPITATION_THRESHOLD_INCHES` environment variable.

## How It Works

1. The function runs daily via Vercel cron
2. It fetches precipitation data for the past 7 days from Open-Meteo API
3. Calculates the total precipitation sum
4. Compares against the configured threshold
5. If threshold is exceeded, sends an email alert via Resend with details

## API Response

The endpoint returns JSON with:
- `success`: Boolean indicating if the check completed successfully
- `message`: Status message
- `precipitation`: Total precipitation in inches
- `threshold`: Configured threshold in inches
- `location`: Latitude and longitude
- `dateRange`: Start and end dates of the check period

## License

ISC

