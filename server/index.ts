import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cors from "cors";

// Global error handlers to prevent app crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

const app = express();
const httpServer = createServer(app);

// Enable CORS for separate frontend development
if (process.env.NODE_ENV === "development") {
  app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
  }));
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      username: string;
      email?: string | null;
      role?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    };
  }
}

// Add session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize default users if using database
  const { initializeDefaultUsers } = await import("./storage");
  await initializeDefaultUsers();
  
  await registerRoutes(httpServer, app);

  // Initialize BMS Manager with multi-vendor support
  try {
    const { bmsManager } = await import("./bms-adapters/bms-manager");
    await bmsManager.initialize();
    const status = bmsManager.getStatus();
    log(`🚀 BMS Manager started: ${status.activeConnections} connections`, "BMS");
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      log('🛑 Shutting down BMS Manager...', "BMS");
      await bmsManager.shutdown();
      process.exit(0);
    });
  } catch (error) {
    log(`❌ BMS Manager failed to start: ${error}`, "BMS");
  }

  // Initialize BACnet Data Collector for live meter readings
  try {
    const { storage } = await import("./storage");
    const { bacnetService } = await import("./protocols/bacnet-service");
    const { initializeBACnetDataCollector } = await import("./protocols/bacnet-data-collector");
    
    // Initialize BACnet service first
    await bacnetService.initialize();
    log(`🚀 BACnet service initialized`, "BACnet");
    
    // Load existing devices from database and register them with BACnet service
    let devices: any[] = [];
    try {
      devices = await storage.getDevices();
      log(`📂 Found ${devices.length} total devices in database`, "BACnet");
    } catch (dbError) {
      log(`❌ Failed to load devices from database: ${dbError}`, "BACnet");
      devices = [];
    }
    
    const meters = devices.filter(d => d.type === 'smart_meter' || d.type === 'Smart Meter');
    
    if (meters.length > 0) {
      log(`📂 Loading ${meters.length} meter(s) from database...`, "BACnet");
      
      for (const device of meters) {
        log(`  → Processing ${device.name} (IP: ${device.ipAddress}, Location: ${device.location})`, "BACnet");
        
        if (device.ipAddress && device.location) {
          const deviceIdMatch = device.location.match(/BACnet Device (\d+)/i);
          if (deviceIdMatch) {
            const bacnetDeviceId = parseInt(deviceIdMatch[1]);
            try {
              await bacnetService.manuallyRegisterDevice(
                device.ipAddress,
                bacnetDeviceId,
                device.name
              );
              log(`  ✓ Restored ${device.name} (${device.ipAddress}, ID: ${bacnetDeviceId})`, "BACnet");
            } catch (err) {
              log(`  ✗ Failed to restore ${device.name}: ${err}`, "BACnet");
            }
          } else {
            log(`  ✗ Could not parse BACnet device ID from location: ${device.location}`, "BACnet");
          }
        } else {
          log(`  ✗ Missing IP address or location for ${device.name}`, "BACnet");
        }
      }
    } else {
      log(`📂 No meters found in database (found ${devices.length} other devices)`, "BACnet");
    }
    
    const dataCollector = initializeBACnetDataCollector(storage);
    await dataCollector.start();
    
    const status = dataCollector.getStatus();
    log(`🚀 BACnet Data Collector started (polling every ${status.pollIntervalMs / 1000}s)`, "BACnet");
    
    // Generate historical data for analytics (30 days of readings)
    // This simulates past data since we just started collecting
    // DISABLED: Only generate for real data collection, not mock mode
    /* if (meters.length > 0) {
      log(`📊 Generating historical data for analytics...`, "BACnet");
      for (const device of meters) {
        await storage.generateHistoricalData(device.id, 30); // 30 days of history
      }
      log(`✅ Historical data generation complete`, "BACnet");
    } */
    
    // Graceful shutdown
    const originalSigIntHandler = process.listeners('SIGINT')[0];
    process.removeAllListeners('SIGINT');
    process.on('SIGINT', async () => {
      log('🛑 Shutting down BACnet Data Collector...', "BACnet");
      dataCollector.stop();
      if (originalSigIntHandler) {
        (originalSigIntHandler as any)();
      } else {
        process.exit(0);
      }
    });
  } catch (error) {
    log(`⚠️  BACnet Data Collector not started: ${error}`, "BACnet");
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else if (!process.env.VITE_DISABLED) {
    // Only setup Vite middleware if not running in backend-only mode
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  } else {
    log("Running in backend-only mode (Vite disabled)", "server");
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
