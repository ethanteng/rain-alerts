# Rain Alert Monitor

A TypeScript-based precipitation monitoring system that runs daily on Vercel, checks the past 7 days of rainfall for a configurable location, and sends email alerts via Resend when weekly precipitation exceeds a configurable threshold. Includes automatic snooze functionality that pauses alerts after significant rainfall.

## Features

- Daily automated precipitation checks
- Configurable location (latitude/longitude)
- Configurable precipitation threshold
- Email alerts via Resend when threshold is exceeded
- Automatic snooze functionality based on rainfall amounts
- Resume notification when snooze period ends
- Runs as a Vercel serverless function with cron scheduling

## Setup

### Prerequisites

- Node.js (v18 or higher)
- A Vercel account
- A Resend account with API key
- A verified sender email domain in Resend
- A Redis database (for snooze functionality) - can be set up via Vercel Marketplace

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

**Required:**
- `RESEND_API_KEY`: Your Resend API key
- `SENDER_EMAIL`: A verified sender email from Resend
- `ALERT_EMAIL`: The email address to receive alerts

**Optional (with defaults):**
- `LOCATION_LATITUDE`: Location latitude (default: 37.8044 for Oakland)
- `LOCATION_LONGITUDE`: Location longitude (default: -122.2708 for Oakland)
- `PRECIPITATION_THRESHOLD_INCHES`: Precipitation threshold in inches (default: 0.5)
- `db_REDIS_URL`: Redis connection URL (required for snooze functionality)

**Snooze Configuration (optional, with defaults):**
- `SNOOZE_MEDIUM_MIN`: Lower bound for medium rainfall range in inches (default: 0.5)
- `SNOOZE_MEDIUM_MAX`: Upper bound for medium rainfall range in inches (default: 1.0)
- `SNOOZE_MEDIUM_WEEKS`: Snooze duration in weeks for medium range (default: 2)
- `SNOOZE_HIGH_MIN`: Lower bound for high rainfall range in inches (default: 1.0)
- `SNOOZE_HIGH_WEEKS`: Snooze duration in weeks for high range (default: 3)

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

### Snooze Functionality

The system automatically snoozes alerts when significant rainfall is detected:

- **Medium rainfall** (0.5-1.0 inches, inclusive): Snoozes alerts for 2 weeks
- **High rainfall** (>1.0 inches): Snoozes alerts for 3 weeks

When the snooze period ends, the system automatically:
1. Sends a "Turn ON sprinklers again" email notification
2. Resumes normal precipitation monitoring

All snooze ranges and durations are configurable via environment variables. If Redis is not configured, the system will operate normally without snooze functionality.

## How It Works

1. The function runs daily via Vercel cron
2. **Snooze check**: If currently snoozed, checks if the snooze period has expired
   - If expired: Sends "Turn ON sprinklers again" email and clears snooze state
   - If still active: Skips precipitation check and returns early
3. **Precipitation check**: If not snoozed, fetches precipitation data for the past 7 days from Open-Meteo API
4. Calculates the total precipitation sum
5. Compares against the configured threshold
6. If threshold is exceeded:
   - Sends an email alert via Resend with details
   - Checks rainfall amount and sets appropriate snooze period if configured

## API Response

The endpoint returns JSON with:
- `success`: Boolean indicating if the check completed successfully
- `message`: Status message
- `precipitation`: Total precipitation in inches (if check was performed)
- `threshold`: Configured threshold in inches (if check was performed)
- `location`: Latitude and longitude
- `dateRange`: Start and end dates of the check period (if check was performed)
- `snoozed`: Boolean indicating if alerts are currently snoozed (if snoozed)
- `expiresAt`: ISO timestamp when snooze expires (if snoozed)
- `snoozeWeeks`: Number of weeks snooze was set for (if snooze was triggered)

## License

ISC

