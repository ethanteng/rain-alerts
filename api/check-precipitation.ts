import { fetchWeatherApi } from "openmeteo";
import { Resend } from "resend";

interface EnvVars {
  RESEND_API_KEY: string;
  ALERT_EMAIL: string;
  SENDER_EMAIL: string;
  PRECIPITATION_THRESHOLD_INCHES?: string;
  LOCATION_LATITUDE?: string;
  LOCATION_LONGITUDE?: string;
}

export default async function handler(req: Request) {
  try {
    // Read environment variables
    const env = process.env as unknown as EnvVars;
    
    if (!env.RESEND_API_KEY || !env.ALERT_EMAIL || !env.SENDER_EMAIL) {
      console.error("Missing required environment variables");
      return Response.json({ 
        error: "Missing required environment variables" 
      }, { status: 500 });
    }

    // Get location coordinates with defaults for Oakland
    const latitude = parseFloat(env.LOCATION_LATITUDE || "37.8044");
    const longitude = parseFloat(env.LOCATION_LONGITUDE || "-122.2708");
    
    // Get precipitation threshold with default of 0.5 inches
    const thresholdInches = parseFloat(env.PRECIPITATION_THRESHOLD_INCHES || "0.5");

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
      return Response.json({
        success: true,
        message: "Alert sent",
        precipitation: totalPrecipitationInches,
        threshold: thresholdInches,
        location: { latitude, longitude },
        dateRange: { start: startDateStr, end: endDateStr },
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

