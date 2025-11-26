import { fetchWeatherApi } from "openmeteo";
import { Resend } from "resend";
import { createClient } from "redis";

interface EnvVars {
  RESEND_API_KEY: string;
  ALERT_EMAIL: string;
  SENDER_EMAIL: string;
  PRECIPITATION_THRESHOLD_INCHES?: string;
  LOCATION_LATITUDE?: string;
  LOCATION_LONGITUDE?: string;
  db_REDIS_URL?: string;
  SNOOZE_MEDIUM_MIN?: string;
  SNOOZE_MEDIUM_MAX?: string;
  SNOOZE_MEDIUM_WEEKS?: string;
  SNOOZE_HIGH_MIN?: string;
  SNOOZE_HIGH_WEEKS?: string;
}

interface SnoozeState {
  isSnoozed: boolean;
  expiresAt: number | null;
}

// Redis helper functions
async function getRedisClient(redisUrl: string) {
  const client = createClient({ url: redisUrl });
  await client.connect();
  return client;
}

function getLocationKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

async function getSnoozeState(redisUrl: string, locationKey: string): Promise<SnoozeState> {
  try {
    const client = await getRedisClient(redisUrl);
    const snoozeKey = `snooze:${locationKey}`;
    const expiryTimestamp = await client.get(snoozeKey);
    await client.quit();
    
    if (!expiryTimestamp) {
      return { isSnoozed: false, expiresAt: null };
    }
    
    const expiresAt = parseInt(expiryTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    
    return {
      isSnoozed: expiresAt > now,
      expiresAt: expiresAt,
    };
  } catch (error) {
    console.error("Error getting snooze state:", error);
    // If Redis fails, assume not snoozed to allow normal operation
    return { isSnoozed: false, expiresAt: null };
  }
}

async function setSnooze(redisUrl: string, locationKey: string, weeks: number): Promise<void> {
  try {
    const client = await getRedisClient(redisUrl);
    const snoozeKey = `snooze:${locationKey}`;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + (weeks * 7 * 24 * 60 * 60); // weeks to seconds
    
    await client.set(snoozeKey, expiresAt.toString());
    await client.quit();
    
    console.log(`Snooze set for ${weeks} weeks, expires at ${new Date(expiresAt * 1000).toISOString()}`);
  } catch (error) {
    console.error("Error setting snooze:", error);
    throw error;
  }
}

async function clearSnooze(redisUrl: string, locationKey: string): Promise<void> {
  try {
    const client = await getRedisClient(redisUrl);
    const snoozeKey = `snooze:${locationKey}`;
    const resumeSentKey = `snooze:resume_sent:${locationKey}`;
    
    await client.del(snoozeKey);
    await client.del(resumeSentKey);
    await client.quit();
    
    console.log("Snooze cleared");
  } catch (error) {
    console.error("Error clearing snooze:", error);
    throw error;
  }
}

async function hasResumeEmailBeenSent(redisUrl: string, locationKey: string): Promise<boolean> {
  try {
    const client = await getRedisClient(redisUrl);
    const resumeSentKey = `snooze:resume_sent:${locationKey}`;
    const sent = await client.get(resumeSentKey);
    await client.quit();
    
    return sent === "1";
  } catch (error) {
    console.error("Error checking resume email flag:", error);
    return false;
  }
}

async function markResumeEmailSent(redisUrl: string, locationKey: string): Promise<void> {
  try {
    const client = await getRedisClient(redisUrl);
    const resumeSentKey = `snooze:resume_sent:${locationKey}`;
    await client.set(resumeSentKey, "1");
    await client.quit();
  } catch (error) {
    console.error("Error marking resume email as sent:", error);
  }
}

export default async function handler(req: Request) {
  try {
    // Read environment variables
    const env = process.env as unknown as EnvVars;
    
    // Check which environment variables are missing
    const missingVars: string[] = [];
    if (!env.RESEND_API_KEY) missingVars.push("RESEND_API_KEY");
    if (!env.ALERT_EMAIL) missingVars.push("ALERT_EMAIL");
    if (!env.SENDER_EMAIL) missingVars.push("SENDER_EMAIL");
    
    if (missingVars.length > 0) {
      console.error("Missing required environment variables:", missingVars.join(", "));
      return Response.json({ 
        error: "Missing required environment variables",
        missing: missingVars
      }, { status: 500 });
    }

    // Get location coordinates with defaults for Oakland
    const latitude = parseFloat(env.LOCATION_LATITUDE || "37.8044");
    const longitude = parseFloat(env.LOCATION_LONGITUDE || "-122.2708");
    const locationKey = getLocationKey(latitude, longitude);
    
    // Get precipitation threshold with default of 0.5 inches
    const thresholdInches = parseFloat(env.PRECIPITATION_THRESHOLD_INCHES || "0.5");
    
    // Get snooze configuration with defaults
    const snoozeMediumMin = parseFloat(env.SNOOZE_MEDIUM_MIN || "0.5");
    const snoozeMediumMax = parseFloat(env.SNOOZE_MEDIUM_MAX || "1.0");
    const snoozeMediumWeeks = parseFloat(env.SNOOZE_MEDIUM_WEEKS || "2");
    const snoozeHighMin = parseFloat(env.SNOOZE_HIGH_MIN || "1.0");
    const snoozeHighWeeks = parseFloat(env.SNOOZE_HIGH_WEEKS || "3");
    
    // Get Redis URL
    const redisUrl = env.db_REDIS_URL;
    
    // Check snooze state if Redis is configured
    if (redisUrl) {
      const snoozeState = await getSnoozeState(redisUrl, locationKey);
      
      if (snoozeState.isSnoozed) {
        console.log(`Currently snoozed until ${new Date(snoozeState.expiresAt! * 1000).toISOString()}`);
        return Response.json({
          success: true,
          message: "Currently snoozed",
          snoozed: true,
          expiresAt: new Date(snoozeState.expiresAt! * 1000).toISOString(),
        });
      }
      
      // If snooze expired, send resume email and clear snooze
      if (snoozeState.expiresAt && snoozeState.expiresAt <= Math.floor(Date.now() / 1000)) {
        const resumeEmailSent = await hasResumeEmailBeenSent(redisUrl, locationKey);
        
        if (!resumeEmailSent) {
          console.log("Snooze period expired, sending resume email...");
          const resend = new Resend(env.RESEND_API_KEY);
          
          const resumeEmailResult = await resend.emails.send({
            from: env.SENDER_EMAIL,
            to: env.ALERT_EMAIL,
            subject: "Turn ON sprinklers again",
            html: `
              <h2>Turn ON sprinklers again</h2>
              <p>The snooze period has ended. You can now resume normal sprinkler operation.</p>
              <p><strong>Location:</strong> ${latitude}°N, ${longitude}°W</p>
            `,
          });
          
          if (resumeEmailResult.error) {
            console.error("Failed to send resume email:", resumeEmailResult.error);
          } else {
            console.log("Resume email sent successfully");
            await markResumeEmailSent(redisUrl, locationKey);
          }
        }
        
        await clearSnooze(redisUrl, locationKey);
        console.log("Snooze cleared, proceeding with normal check");
      }
    }

    // Calculate date range (past 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`Checking precipitation for location (${latitude}, ${longitude})`);
    console.log(`Date range: ${startDateStr} to ${endDateStr}`);
    console.log(`Threshold: ${thresholdInches} inches`);

    // Fetch weather data
    const params = {
      latitude: latitude,
      longitude: longitude,
      start_date: startDateStr,
      end_date: endDateStr,
      daily: "precipitation_sum",
      timezone: "America/Los_Angeles",
    };

    const url = "https://archive-api.open-meteo.com/v1/archive";
    const responses = await fetchWeatherApi(url, params);

    if (!responses || responses.length === 0) {
      console.error("No weather data received");
      return Response.json({ error: "Failed to fetch weather data" }, { status: 500 });
    }

    const response = responses[0];
    const daily = response.daily();

    if (!daily) {
      console.error("No daily data available");
      return Response.json({ error: "No daily weather data available" }, { status: 500 });
    }

    const utcOffsetSeconds = response.utcOffsetSeconds();
    const precipitationValues = daily.variables(0)?.valuesArray();

    if (!precipitationValues) {
      console.error("No precipitation data available");
      return Response.json({ error: "No precipitation data available" }, { status: 500 });
    }

    // Calculate total precipitation (values are in mm, convert to inches)
    const totalPrecipitationMm = precipitationValues.reduce(
      (sum: number, value: number) => sum + value,
      0
    );
    const totalPrecipitationInches = totalPrecipitationMm / 25.4;

    console.log(`Total precipitation: ${totalPrecipitationInches.toFixed(2)} inches`);

    // Check if threshold is exceeded
    if (totalPrecipitationInches > thresholdInches) {
      console.log(`Threshold exceeded! Sending alert email...`);

      // Send email alert
      const resend = new Resend(env.RESEND_API_KEY);

      const emailResult = await resend.emails.send({
        from: env.SENDER_EMAIL,
        to: env.ALERT_EMAIL,
        subject: `Rain Alert: ${totalPrecipitationInches.toFixed(2)}" of rain in the past week`,
        html: `
          <h2>Rain Alert</h2>
          <p>Precipitation threshold has been exceeded!</p>
          <ul>
            <li><strong>Location:</strong> ${latitude}°N, ${longitude}°W</li>
            <li><strong>Date Range:</strong> ${startDateStr} to ${endDateStr}</li>
            <li><strong>Total Precipitation:</strong> ${totalPrecipitationInches.toFixed(2)} inches</li>
            <li><strong>Threshold:</strong> ${thresholdInches} inches</li>
          </ul>
        `,
      });

      if (emailResult.error) {
        console.error("Failed to send email:", emailResult.error);
        return Response.json({ 
          error: "Failed to send alert email",
          details: emailResult.error 
        }, { status: 500 });
      }

      console.log("Alert email sent successfully");
      
      // Check if we should snooze based on rainfall amount
      let snoozeWeeks: number | null = null;
      if (redisUrl) {
        if (totalPrecipitationInches >= snoozeHighMin) {
          // More than high threshold (default: >= 1.0 inches)
          snoozeWeeks = snoozeHighWeeks;
          console.log(`High rainfall detected (${totalPrecipitationInches.toFixed(2)}" >= ${snoozeHighMin}"), setting snooze for ${snoozeHighWeeks} weeks`);
        } else if (totalPrecipitationInches >= snoozeMediumMin && totalPrecipitationInches <= snoozeMediumMax) {
          // Medium range (default: 0.5-1.0 inches, inclusive)
          snoozeWeeks = snoozeMediumWeeks;
          console.log(`Medium rainfall detected (${totalPrecipitationInches.toFixed(2)}" in range ${snoozeMediumMin}-${snoozeMediumMax}), setting snooze for ${snoozeMediumWeeks} weeks`);
        }
        
        if (snoozeWeeks !== null) {
          try {
            await setSnooze(redisUrl, locationKey, snoozeWeeks);
          } catch (error) {
            console.error("Failed to set snooze:", error);
            // Continue even if snooze setting fails
          }
        }
      }
      
      return Response.json({
        success: true,
        message: "Alert sent",
        precipitation: totalPrecipitationInches,
        threshold: thresholdInches,
        location: { latitude, longitude },
        dateRange: { start: startDateStr, end: endDateStr },
        snoozed: snoozeWeeks !== null,
        snoozeWeeks: snoozeWeeks,
      });
    } else {
      console.log(`Precipitation (${totalPrecipitationInches.toFixed(2)}") below threshold (${thresholdInches}")`);
      return Response.json({
        success: true,
        message: "No alert needed",
        precipitation: totalPrecipitationInches,
        threshold: thresholdInches,
        location: { latitude, longitude },
        dateRange: { start: startDateStr, end: endDateStr },
      });
    }
  } catch (error: any) {
    console.error("Error checking precipitation:", error);
    return Response.json({
      error: "Internal server error",
      details: error.message,
    }, { status: 500 });
  }
}

