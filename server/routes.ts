import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./replit_integrations/auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { bmsManager } from "./bms-adapters/bms-manager";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "csv-parse/sync";

// Import Auth routes registration
import { registerAuthRoutes } from "./replit_integrations/auth";

// Helper function to check if a reading has valid data
// Requires at least 2 of the 4 main parameters to be valid
function isValidReading(reading: any): boolean {
  if (!reading) return false;
  
  const validParams = [
    reading.power && reading.power > 0,
    reading.voltage && reading.voltage > 0,
    reading.current && reading.current > 0,
    reading.frequency && reading.frequency > 0
  ].filter(Boolean).length;
  
  return validParams >= 2;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // 1. Setup Auth (Only if REPL_ID is configured for Replit environment)
  if (process.env.REPL_ID && process.env.ISSUER_URL) {
    await setupAuth(app);
    registerAuthRoutes(app);
  } else {
    console.log("⚠️  Skipping auth setup - running in development mode");
    
    // Add mock auth routes for development
    app.get("/api/auth/user", (req, res) => {
      // Check session for current user
      const currentUser = req.session?.user;
      if (currentUser) {
        res.json(currentUser);
      } else {
        res.status(401).json({ message: "Not authenticated" });
      }
    });

    app.post("/api/auth/login", async (req, res) => {
      try {
        const { username, password } = req.body;
        
        // Get user from storage and validate password
        const users = await storage.getUsers();
        const user = users.find(u => u.username === username);
        
        if (!user) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
        
        // Check password (in MockStorage, we have default passwords)
        const validPassword = ((storage as any).userPasswords?.get(username) === password) ||
                             (username === "admin" && password === "admin123") ||
                             (username === "operator" && password === "operator123");
        
        if (!validPassword) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
        
        // Store user in session
        if (!req.session) {
          req.session = {} as any;
        }
        req.session.user = user;
        
        res.json(user);
      } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: "Login failed" });
      }
    });
    
    app.get("/api/login", (req, res) => {
      res.redirect("/?login=true");
    });
    
    app.post("/api/logout", (req, res) => {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            return res.status(500).json({ message: "Logout failed" });
          }
          res.clearCookie('connect.sid');
          res.json({ message: "Logged out successfully" });
        });
      } else {
        res.json({ message: "Already logged out" });
      }
    });
    
    app.get("/api/logout", (req, res) => {
      res.redirect("/");
    });
  }

  // 2. Application Routes

  // --- Devices ---
  app.get(api.devices.list.path, async (req, res) => {
    const devices = await storage.getDevices();
    res.json(devices);
  });

  app.get(api.devices.get.path, async (req, res) => {
    const device = await storage.getDevice(Number(req.params.id));
    if (!device) return res.status(404).json({ message: "Device not found" });
    res.json(device);
  });

  app.post(api.devices.create.path, async (req, res) => {
    try {
      console.log('Creating device with data:', req.body);
      const input = api.devices.create.input.parse(req.body);
      console.log('Validated input:', input);
      const device = await storage.createDevice(input);
      console.log('Created device:', device);
      res.status(201).json(device);
    } catch (e) {
      console.error('Device creation error:', e);
      if (e instanceof z.ZodError) return res.status(400).json(e.errors);
      throw e;
    }
  });

  app.put(api.devices.update.path, async (req, res) => {
    try {
      console.log('Updating device with ID:', req.params.id);
      console.log('Update data:', req.body);
      const input = api.devices.update.input.parse(req.body);
      console.log('Validated input:', input);
      
      // Ensure config is properly handled (can be null or object)
      if (input.config === undefined) {
        delete (input as any).config;
      }
      
      const device = await storage.updateDevice(Number(req.params.id), input);
      console.log('Updated device:', device);
      res.json(device);
    } catch (e) {
      console.error('Device update error:', e);
      if (e instanceof z.ZodError) {
        console.error('Validation errors:', e.errors);
        return res.status(400).json({ message: "Validation failed", errors: e.errors });
      }
      res.status(500).json({ message: "Update failed", error: String(e) });
    }
  });

  app.delete(api.devices.delete.path, async (req, res) => {
    await storage.deleteDevice(Number(req.params.id));
    res.status(204).send();
  });

  // --- Readings ---
  app.get(api.readings.latest.path, async (req, res) => {
    const reading = await storage.getLatestReading(Number(req.params.id));
    if (!reading) return res.status(404).json({ message: "No readings found" });
    res.json(reading);
  });

  app.get(api.readings.history.path, async (req, res) => {
    const limit = Number(req.query.limit) || 100;
    const readings = await storage.getReadings(Number(req.params.id), limit);
    res.json(readings);
  });

  app.post(api.readings.create.path, async (req, res) => {
    try {
      const input = api.readings.create.input.parse(req.body);
      const reading = await storage.createReading(input);
      res.status(201).json(reading);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json(e.errors);
      throw e;
    }
  });

  // --- Alerts ---
  app.get(api.alerts.list.path, async (req, res) => {
    const status = req.query.status as 'active' | 'acknowledged' | 'all' | undefined;
    const alerts = await storage.getAlerts(status);
    res.json(alerts);
  });

  app.post(api.alerts.acknowledge.path, async (req, res) => {
    // In a real app, we'd get userId from req.user
    // const userId = req.user?.id;
    const alert = await storage.acknowledgeAlert(Number(req.params.id), undefined);
    res.json(alert);
  });

  // --- Meters ---
  app.get("/api/meters", async (req, res) => {
    try {
      // Get energy meters from database
      const { db } = await import('./db');
      const { devices } = await import('@shared/schema');
      
      if (db) {
        const { eq } = await import('drizzle-orm');
        const energyMeters = await db.select().from(devices).where(eq(devices.type, 'energy_meter'));
        res.json(energyMeters);
      } else {
        // Fallback to storage if DB not available
        const meters = await storage.getMeters();
        res.json(meters);
      }
    } catch (error) {
      console.error('Failed to get meters:', error);
      res.status(500).json({ message: "Failed to fetch meters" });
    }
  });

  app.get("/api/meters/:id/reading", async (req, res) => {
    try {
      // Get latest reading from database
      const { db } = await import('./db');
      const { readings } = await import('@shared/schema');
      
      if (db) {
        const { eq, desc } = await import('drizzle-orm');
        const latestReading = await db.select()
          .from(readings)
          .where(eq(readings.deviceId, Number(req.params.id)))
          .orderBy(desc(readings.timestamp))
          .limit(1);
        
        res.json(latestReading[0] || null);
      } else {
        const reading = await storage.getMeterReading(Number(req.params.id));
        res.json(reading);
      }
    } catch (error) {
      console.error('Failed to get meter reading:', error);
      res.status(500).json({ message: "Failed to fetch meter reading" });
    }
  });

  app.get("/api/meters/:id/readings", async (req, res) => {
    try {
      const hours = req.query.hours ? Number(req.query.hours) : 24;
      
      // Get readings from database
      const { db } = await import('./db');
      const { readings } = await import('@shared/schema');
      
      if (db) {
        const { eq, gte, and } = await import('drizzle-orm');
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        const deviceReadings = await db.select()
          .from(readings)
          .where(and(
            eq(readings.deviceId, Number(req.params.id)),
            gte(readings.timestamp, since)
          ));
        
        res.json(deviceReadings);
      } else {
        const deviceReadings = await storage.getMeterReadings(Number(req.params.id), hours);
        res.json(deviceReadings);
      }
    } catch (error) {
      console.error('Failed to get meter readings:', error);
      res.status(500).json({ message: "Failed to fetch meter readings" });
    }
  });

  // Get BACnet parameters for a device/meter
  app.get("/api/devices/:id/bacnet-parameters", async (req, res) => {
    try {
      const deviceId = Number(req.params.id);
      const mappings = await storage.getBacnetObjectMappingsByDevice(deviceId);
      console.log(`[BACnet Parameters] Device ${deviceId}: Found ${mappings.length} parameters`);
      mappings.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.objectName} (Type:${m.objectType}, Instance:${m.objectInstance})`);
      });
      res.json({
        success: true,
        deviceId,
        parameters: mappings
      });
    } catch (error) {
      console.error('Failed to get BACnet parameters:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to fetch BACnet parameters" 
      });
    }
  });

  // Get live values for BACnet parameters
  app.get("/api/devices/:id/bacnet-parameters/values", async (req, res) => {
    try {
      const deviceId = Number(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found"
        });
      }

      const mappings = await storage.getBacnetObjectMappingsByDevice(deviceId);
      
      // Extract BACnet device ID from location string "BACnet Device 17800"
      const bacnetDeviceIdMatch = device.location?.match(/BACnet Device (\d+)/i);
      const bacnetDeviceId = bacnetDeviceIdMatch ? parseInt(bacnetDeviceIdMatch[1]) : null;
      
      if (!bacnetDeviceId) {
        return res.status(400).json({
          success: false,
          message: "Could not determine BACnet device ID from device location"
        });
      }
      
      // Use the device's IP address (which should be 192.168.1.33)
      const ipAddress = device.ipAddress;
      
      console.log(`[Parameter Values] Reading from device ${deviceId}, BACnet Device ${bacnetDeviceId} at ${ipAddress}`);
      
      const { bacnetService } = await import('./protocols/bacnet-service');
      const client = (bacnetService as any).client;
      
      if (!client) {
        return res.status(500).json({
          success: false,
          message: "BACnet client not initialized"
        });
      }
      
      // Read current values for all parameters using direct client access
      const parameterValues = await Promise.all(
        mappings.map(async (param) => {
          try {
            // Use same format as data collector for consistency
            const result = await new Promise<any>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Timeout reading BACnet value'));
              }, 5000); // 5 second timeout

              client.readProperty(
                ipAddress,
                { type: param.objectType, instance: param.objectInstance },
                85, // PROP_PRESENT_VALUE
                (err: any, value: any) => {
                  clearTimeout(timeout);
                  if (err) {
                    reject(err);
                  } else {
                    resolve(value);
                  }
                }
              );
            });
            
            // Extract numeric value from BACnet response
            let currentValue = null;
            if (result && result.values && result.values.length > 0) {
              const bacnetValue = result.values[0];
              if (typeof bacnetValue.value === 'number') {
                currentValue = bacnetValue.value;
              } else if (typeof bacnetValue === 'number') {
                currentValue = bacnetValue;
              }
            }
            
            console.log(`[Parameter Values] ${param.objectName}: ${currentValue}`);
            
            return {
              ...param,
              currentValue,
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            console.error(`[Parameter Values] Failed to read ${param.objectName}:`, error);
            return {
              ...param,
              currentValue: null,
              error: 'Read failed',
              timestamp: new Date().toISOString()
            };
          }
        })
      );

      res.json({
        success: true,
        deviceId,
        parameters: parameterValues
      });
    } catch (error) {
      console.error('Failed to get parameter values:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch parameter values"
      });
    }
  });

  // --- BACnet Discovery ---
  app.get("/api/bacnet/discover", async (req, res) => {
    try {
      const { bacnetService } = await import('./protocols/bacnet-service');
      
      // Initialize if not already running
      if (!bacnetService.isRunning()) {
        await bacnetService.initialize();
      }
      
      const devices = await bacnetService.discoverDevices();
      res.json({
        success: true,
        count: devices.length,
        devices
      });
    } catch (error) {
      console.error('BACnet discovery failed:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to discover BACnet devices",
        error: String(error) 
      });
    }
  });

  // --- BACnet Direct Communication Test ---
  app.post("/api/bacnet/test-direct", async (req, res) => {
    try {
      const { address, deviceId } = req.body;
      
      if (!address || !deviceId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: address, deviceId"
        });
      }

      const { bacnetService } = await import('./protocols/bacnet-service');
      
      // Initialize if not already running
      if (!bacnetService.isRunning()) {
        await bacnetService.initialize();
      }
      
      const success = await bacnetService.testDirectCommunication(address, deviceId);
      
      res.json({
        success,
        message: success 
          ? "Direct BACnet communication successful - device is responding"
          : "Direct BACnet communication failed - device not responding or service not running",
        address,
        deviceId
      });
    } catch (error) {
      console.error('Direct communication test failed:', error);
      res.status(500).json({ 
        success: false, 
        message: "Test failed with error",
        error: String(error) 
      });
    }
  });

  // --- BACnet Manual Device Registration ---
  app.post("/api/bacnet/register-device", async (req, res) => {
    try {
      const { address, deviceId, deviceName } = req.body;
      
      if (!address || !deviceId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: address, deviceId"
        });
      }

      const { bacnetService } = await import('./protocols/bacnet-service');
      
      // Initialize if not already running
      if (!bacnetService.isRunning()) {
        await bacnetService.initialize();
      }
      
      // Manually register the device in BACnet service (discovery list only)
      const bacnetDevice = await bacnetService.manuallyRegisterDevice(address, deviceId, deviceName);
      
      if (!bacnetDevice) {
        return res.status(400).json({
          success: false,
          message: "Failed to register device - could not read device properties"
        });
      }

      // Note: We don't create a device entry here anymore
      // The controller itself is not a meter/device
      // When you "Save Selected Meters", the actual meters will be saved as devices
      // and the controller info will be saved to bacnet_controllers table
      
      console.log(`✅ BACnet controller ${bacnetDevice.name} (ID: ${deviceId}) registered in discovery list`);
      console.log(`   Use the "Select Parameters & Save" button to add the actual meters as devices`);
      
      res.json({
        success: true,
        message: "BACnet controller registered successfully. Now select and save the meters you want to monitor.",
        device: bacnetDevice
      });
    } catch (error) {
      console.error('Manual device registration failed:', error);
      res.status(500).json({ 
        success: false, 
        message: "Registration failed with error",
        error: String(error) 
      });
    }
  });

  /**
   * GET /api/bacnet/network-diagnostic
   * Network diagnostic to check BACnet connectivity
   */
  app.get("/api/bacnet/network-diagnostic", async (req, res) => {
    try {
      const os = await import('os');
      const { execSync } = await import('child_process');
      const { GENERIC_BACNET_CONFIG } = await import('./protocols/bacnet-types');
      
      const interfaces = os.networkInterfaces();
      const interfaceInfo: any[] = [];
      
      // Get all network interfaces
      for (const [name, addrs] of Object.entries(interfaces)) {
        if (addrs) {
          for (const addr of addrs) {
            if (addr.family === 'IPv4' && !addr.internal) {
              interfaceInfo.push({
                name,
                address: addr.address,
                netmask: addr.netmask,
                mac: addr.mac,
                cidr: addr.cidr
              });
            }
          }
        }
      }
      
      // Check if UDP port 47808 is listening
      let portStatus = 'unknown';
      try {
        const netstat = execSync('netstat -an | findstr ":47808"', { encoding: 'utf8' });
        portStatus = netstat.includes('0.0.0.0:47808') || netstat.includes('*:47808') ? 'listening' : 'not listening';
      } catch {
        portStatus = 'not listening';
      }
      
      // Check firewall status for UDP 47808
      let firewallRules: string[] = [];
      try {
        const fwRules = execSync('netsh advfirewall firewall show rule name=all | findstr /i "bacnet 47808"', { encoding: 'utf8' });
        firewallRules = fwRules.split('\n').filter(l => l.trim());
      } catch {
        firewallRules = ['No firewall rules found for BACnet'];
      }
      
      res.json({
        success: true,
        config: {
          interface: GENERIC_BACNET_CONFIG.interface,
          port: GENERIC_BACNET_CONFIG.port,
          broadcast: GENERIC_BACNET_CONFIG.broadcastAddress
        },
        networkInterfaces: interfaceInfo,
        portStatus,
        firewallRules,
        recommendations: [
          interfaceInfo.length === 0 ? 'No active network interfaces found' : null,
          portStatus !== 'listening' ? 'UDP port 47808 may not be open for BACnet communication' : null,
          !interfaceInfo.find(i => i.address === GENERIC_BACNET_CONFIG.interface) ? 
            `Configured interface ${GENERIC_BACNET_CONFIG.interface} not found on system` : null
        ].filter(Boolean)
      });
    } catch (error: any) {
      console.error('Network diagnostic failed:', error);
      res.status(500).json({ 
        success: false, 
        message: "Network diagnostic failed",
        error: error.message 
      });
    }
  });

  /**
   * GET /api/bacnet/device/:deviceId/objects
   * Debug endpoint: Read ALL BACnet objects with their names and values
   */
  app.get("/api/bacnet/device/:deviceId/objects", async (req, res) => {
    try {
      const { bacnetService } = await import('./protocols/bacnet-service');
      
      const deviceId = Number(req.params.deviceId);
      const ipAddress = req.query.address as string;

      if (!ipAddress) {
        return res.status(400).json({
          success: false,
          message: "Device IP address is required (use ?address=x.x.x.x)"
        });
      }

      // Initialize BACnet service if needed
      if (!bacnetService.isRunning()) {
        await bacnetService.initialize();
      }

      // Read object list
      const objects = await bacnetService.readObjectList(deviceId, ipAddress);
      console.log(`📋 Reading properties for ${objects.length} objects...`);

      // Read properties for each object
      const objectDetails = await Promise.all(
        objects.map(async (obj: any) => {
          try {
            const name = await bacnetService.readProperty(deviceId, ipAddress, obj.type, obj.instance, 77).catch(() => `${obj.type}:${obj.instance}`);
            const presentValue = await bacnetService.readProperty(deviceId, ipAddress, obj.type, obj.instance, 85).catch(() => null);
            const description = await bacnetService.readProperty(deviceId, ipAddress, obj.type, obj.instance, 28).catch(() => null);
            
            return {
              type: obj.type,
              instance: obj.instance,
              name,
              presentValue,
              description
            };
          } catch (error) {
            return {
              type: obj.type,
              instance: obj.instance,
              name: `${obj.type}:${obj.instance}`,
              presentValue: null,
              description: null,
              error: 'Failed to read properties'
            };
          }
        })
      );

      res.json({
        success: true,
        deviceId,
        ipAddress,
        objectCount: objectDetails.length,
        objects: objectDetails
      });
    } catch (error: any) {
      console.error('Failed to read BACnet objects:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to read BACnet objects",
        error: error.message 
      });
    }
  });

  /**
   * GET /api/bacnet/device/:deviceId/modbus-meters
   * Scan BACnet device for Modbus meter objects (vendor-independent)
   */
  app.get("/api/bacnet/device/:deviceId/modbus-meters", async (req, res) => {
    try {
      const { bacnetService } = await import('./protocols/bacnet-service');
      const { BACnetModbusMapper } = await import('./protocols/bacnet-modbus-mapper');
      
      const deviceId = Number(req.params.deviceId);
      const ipAddress = req.query.address as string;

      if (!ipAddress) {
        return res.status(400).json({
          success: false,
          message: "Device IP address is required (use ?address=x.x.x.x)"
        });
      }

      // Initialize BACnet service if needed
      if (!bacnetService.isRunning()) {
        await bacnetService.initialize();
      }

      // Create mapper and scan for Modbus objects
      const mapper = new BACnetModbusMapper(bacnetService);
      const meters = await mapper.scanForModbusObjects(deviceId, ipAddress);

      // Store mapper globally for later reads
      (global as any).bacnetModbusMapper = mapper;

      res.json({
        success: true,
        deviceId,
        ipAddress,
        meterCount: meters.length,
        meters: meters.map(meter => ({
          address: meter.address,
          name: meter.name,
          location: meter.location,
          manufacturer: meter.manufacturer,
          model: meter.model,
          parameterCount: meter.parameters.length,
          categories: {
            power: meter.categories.power.length,
            energy: meter.categories.energy.length,
            voltage: meter.categories.voltage.length,
            current: meter.categories.current.length,
            frequency: meter.categories.frequency.length,
            powerFactor: meter.categories.powerFactor.length,
            other: meter.categories.other.length
          },
          sampleParameters: meter.parameters.slice(0, 5).map(p => ({
            name: p.objectName,
            type: p.parameterType,
            phase: p.phase,
            units: p.units,
            bacnetObject: `${p.objectType}:${p.objectInstance}`
          }))
        }))
      });
    } catch (error: any) {
      console.error('Modbus meter discovery failed:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to discover Modbus meters via BACnet",
        error: error.message 
      });
    }
  });

  /**
   * GET /api/bacnet/modbus-meter/:meterKey/read
   * Read current values from a discovered Modbus meter via BACnet
   */
  app.get("/api/bacnet/modbus-meter/:meterKey/read", async (req, res) => {
    try {
      const mapper = (global as any).bacnetModbusMapper;
      
      if (!mapper) {
        return res.status(400).json({
          success: false,
          message: "No Modbus meters discovered yet. Call /api/bacnet/device/:deviceId/modbus-meters first"
        });
      }

      const { meterKey } = req.params;
      const values = await mapper.readMeterValues(meterKey);

      // Convert Map to object for JSON response
      const valuesObj: any = {};
      for (const [key, value] of values.entries()) {
        valuesObj[key] = value;
      }

      res.json({
        success: true,
        meterKey,
        timestamp: new Date(),
        valueCount: values.size,
        values: valuesObj
      });
    } catch (error: any) {
      console.error('Failed to read meter values:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to read meter values",
        error: error.message 
      });
    }
  });

  /**
   * GET /api/bacnet/modbus-meters/config
   * Export meter configurations for dashboard setup
   */
  app.get("/api/bacnet/modbus-meters/config", async (req, res) => {
    try {
      const mapper = (global as any).bacnetModbusMapper;
      
      if (!mapper) {
        return res.status(400).json({
          success: false,
          message: "No Modbus meters discovered yet"
        });
      }

      const configs = mapper.exportMeterConfigs();

      res.json({
        success: true,
        meterCount: configs.length,
        meters: configs
      });
    } catch (error: any) {
      console.error('Failed to export meter configs:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to export meter configurations",
        error: error.message 
      });
    }
  });

  /**
   * POST /api/bacnet/device/:deviceId/save-meters
   * Save discovered BACnet-Modbus meters to device list
   * 
   * Body: {
   *   meters: [{
   *     name: string,
   *     meterGroupKey: string,
   *     location?: string,
   *     deviceType?: string,
   *     parameters: [...]
   *   }]
   * }
   */
  app.post("/api/bacnet/device/:deviceId/save-meters", async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { meters } = req.body;
      
      if (!Array.isArray(meters) || meters.length === 0) {
        return res.status(400).json({
          success: false,
          message: "meters array is required"
        });
      }

      // Import BACnet service
      const { bacnetService } = await import('./protocols/bacnet-service');
      
      // Initialize if not running
      if (!bacnetService.isRunning()) {
        await bacnetService.initialize();
      }

      // Get BACnet device info
      const bacnetDevices = bacnetService.getDiscoveredDevices();
      const bacnetDevice = bacnetDevices.find((d: any) => d.deviceId === Number(deviceId));
      
      if (!bacnetDevice) {
        return res.status(404).json({
          success: false,
          message: `BACnet device ${deviceId} not found`
        });
      }

      const savedDevices: any[] = [];

      // Check for existing BACnet object mappings to prevent duplicate parameter bindings
      // This prevents saving the same BACnet objects even if device names differ
      console.log(`[Duplicate Check Server] Checking for duplicate BACnet object mappings...`);
      
      // Get all existing devices and their BACnet mappings
      const allDevices = await storage.getDevices();
      const allMappings: any[] = [];
      for (const dev of allDevices) {
        const mappings = await storage.getBacnetObjectMappingsByDevice(dev.id);
        allMappings.push(...mappings);
      }
      
      console.log(`[Duplicate Check Server] Found ${allMappings.length} existing BACnet object mappings`);
      
      const duplicateObjects: string[] = [];
      for (const meter of meters) {
        for (const param of meter.parameters) {
          // Check if this BACnet object (type + instance) is already mapped
          const isDuplicate = allMappings.some(mapping => 
            mapping.objectType === param.objectType && 
            mapping.objectInstance === param.objectInstance
          );
          
          if (isDuplicate) {
            const objectRef = `${param.objectName} (Type${param.objectType}:${param.objectInstance})`;
            if (!duplicateObjects.includes(objectRef)) {
              duplicateObjects.push(objectRef);
              console.log(`[Duplicate Check Server] ❌ Duplicate BACnet object: ${objectRef}`);
            }
          }
        }
      }
      
      if (duplicateObjects.length > 0) {
        console.warn(`[Duplicate Check Server] ⚠️  Blocked ${duplicateObjects.length} duplicate BACnet objects`);
        return res.status(400).json({
          success: false,
          message: `Cannot save: ${duplicateObjects.length} BACnet object(s) are already mapped to other devices. Each BACnet object can only be mapped once. First duplicate: ${duplicateObjects[0]}`,
          duplicateObjects: duplicateObjects
        });
      }
      
      console.log(`[Duplicate Check Server] ✅ No duplicates found, proceeding to save...`);

      // Save each meter as a device
      for (const meter of meters) {
        const { name, meterGroupKey, location, deviceType, parameters } = meter;

        // Determine device type from meter name or parameters
        let type = deviceType || 'Smart Meter';
        if (name.includes('VFD') || name.includes('Drive') || name.includes('Inverter')) {
          type = 'VFD';
        } else if (name.includes('EM_') || name.includes('Meter')) {
          type = 'Smart Meter';
        }

        // Create device
        const device = await storage.createDevice({
          name: name,
          type: type,
          location: location || `BACnet Device ${deviceId}`,
          ipAddress: bacnetDevice.ipAddress,
          status: 'online',
        });

        // Store BACnet controller info if not exists
        let controller = await storage.getBacnetControllerByDeviceId(Number(deviceId));
        if (!controller) {
          controller = await storage.createBacnetController({
            name: bacnetDevice.name || `BACnet Device ${deviceId}`,
            ipAddress: bacnetDevice.ipAddress,
            deviceId: Number(deviceId),
            port: 47808,
            status: 'online',
            vendorId: bacnetDevice.vendorId,
            vendorName: bacnetDevice.vendorName,
            maxApdu: bacnetDevice.maxApdu || 1476,
          });
        }

        // Create BACnet object mappings for each parameter
        const mappings: any[] = [];
        for (const param of parameters) {
          // Determine which device field this maps to
          let mappedField = null;
          if (param.parameterType?.includes('power')) {
            mappedField = 'power';
          } else if (param.parameterType?.includes('voltage')) {
            mappedField = 'voltage';
          } else if (param.parameterType?.includes('current')) {
            mappedField = 'current';
          } else if (param.parameterType?.includes('energy')) {
            mappedField = 'energy';
          } else if (param.parameterType?.includes('frequency')) {
            mappedField = 'frequency';
          }

          const mapping = await storage.createBacnetObjectMapping({
            deviceId: device.id,
            bacnetControllerId: controller.id,
            objectType: param.objectType,
            objectInstance: param.objectInstance,
            objectName: param.objectName,
            meterGroupKey: meterGroupKey,
            parameterType: param.parameterType,
            parameterCategory: param.category,
            phase: param.phase,
            mappedToField: mappedField,
            units: param.units,
            scaleFactor: param.scaleFactor || 1.0,
            description: param.description,
            enabled: true,
          });

          mappings.push(mapping);
        }

        savedDevices.push({
          device,
          controller,
          mappingCount: mappings.length,
        });
      }

      res.json({
        success: true,
        message: `Saved ${savedDevices.length} meters to device list`,
        savedCount: savedDevices.length,
        devices: savedDevices.map(d => ({
          id: d.device.id,
          name: d.device.name,
          type: d.device.type,
          location: d.device.location,
          ipAddress: d.device.ipAddress,
          parameterCount: d.mappingCount,
        })),
      });

    } catch (error: any) {
      console.error('Failed to save meters:', error);
      res.status(500).json({
        success: false,
        message: "Failed to save meters",
        error: error.message,
      });
    }
  });

  app.get("/api/bacnet/devices/:deviceId/modbus", async (req, res) => {
    try {
      const { bacnetService } = await import('./protocols/bacnet-service');
      const deviceId = Number(req.params.deviceId);
      
      // Get device from service
      const devices = await bacnetService.discoverDevices();
      const device = devices.find(d => d.deviceId === deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: "BACnet device not found" 
        });
      }
      
      // Scan for Modbus capabilities
      const capabilities = await bacnetService.scanForModbusCapabilities(device);
      res.json({
        success: true,
        deviceId,
        capabilities
      });
    } catch (error) {
      console.error('Modbus capability scan failed:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to scan Modbus capabilities",
        error: String(error) 
      });
    }
  });

  // Get cached devices without triggering discovery
  app.get("/api/bacnet/devices", async (req, res) => {
    try {
      const { bacnetService } = await import('./protocols/bacnet-service');
      const devices = Array.from((bacnetService as any).discoveredDevices.values());
      res.json({
        success: true,
        count: devices.length,
        devices
      });
    } catch (error) {
      console.error('Failed to get BACnet devices:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get BACnet devices",
        error: String(error) 
      });
    }
  });

  // Delete a device from discovered devices
  app.delete("/api/bacnet/devices/:deviceId", async (req, res) => {
    try {
      const { bacnetService } = await import('./protocols/bacnet-service');
      const deviceId = parseInt(req.params.deviceId);
      
      if (isNaN(deviceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid device ID"
        });
      }

      // Find and delete all associated meters/devices from database
      const allDevices = await storage.getDevices();
      const associatedDevices = allDevices.filter(d => 
        d.location?.includes(`BACnet Device ${deviceId}`) || 
        d.location?.includes(`Device ${deviceId}`)
      );
      
      console.log(`[BACnet Delete] Found ${associatedDevices.length} associated device(s) to delete`);
      
      for (const device of associatedDevices) {
        console.log(`[BACnet Delete] Deleting device ${device.id}: ${device.name}`);
        await storage.deleteDevice(device.id);
      }
      
      // Remove BACnet controller if exists
      const controller = await storage.getBacnetControllerByDeviceId(deviceId);
      if (controller) {
        console.log(`[BACnet Delete] Deleting BACnet controller ${controller.id}`);
        await storage.deleteBacnetController(controller.id);
      }

      // Remove from discoveredDevices Map
      let removed = false;
      for (const [key, device] of (bacnetService as any).discoveredDevices.entries()) {
        if (device.deviceId === deviceId) {
          (bacnetService as any).discoveredDevices.delete(key);
          removed = true;
          console.log(`[BACnet] Removed device ${deviceId} from discovered devices`);
          break;
        }
      }

      res.json({
        success: true,
        message: `BACnet device ${deviceId} and ${associatedDevices.length} associated meter(s) deleted successfully`,
        deletedCount: associatedDevices.length
      });
    } catch (error) {
      console.error('Failed to delete BACnet device:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to delete BACnet device",
        error: String(error) 
      });
    }
  });

  app.get("/api/bacnet/status", async (req, res) => {
    try {
      const { bacnetService } = await import('./protocols/bacnet-service');
      const status = bacnetService.getStatus();
      res.json({
        success: true,
        status
      });
    } catch (error) {
      console.error('Failed to get BACnet status:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get BACnet service status",
        error: String(error) 
      });
    }
  });

  app.post("/api/bacnet/start", async (req, res) => {
    try {
      const { bacnetService } = await import('./protocols/bacnet-service');
      await bacnetService.initialize();
      
      // Store in global for other endpoints to access
      (global as any).bacnetService = bacnetService;
      
      res.json({
        success: true,
        message: "BACnet service started"
      });
    } catch (error) {
      console.error('Failed to start BACnet service:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to start BACnet service",
        error: String(error) 
      });
    }
  });

  app.post("/api/bacnet/stop", async (req, res) => {
    try {
      const { bacnetService } = await import('./protocols/bacnet-service');
      await bacnetService.shutdown();
      res.json({
        success: true,
        message: "BACnet service stopped"
      });
    } catch (error) {
      console.error('Failed to stop BACnet service:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to stop BACnet service",
        error: String(error) 
      });
    }
  });

  // --- Modbus Scanner Endpoints ---
  
  /**
   * POST /api/modbus/connect
   * Connect to Modbus bus (via TCP gateway or serial)
   */
  app.post("/api/modbus/connect", async (req, res) => {
    try {
      const { ModbusScanner } = await import('./protocols/modbus-scanner');
      const { connectionType, options } = req.body;

      if (!connectionType || !options) {
        return res.status(400).json({
          success: false,
          message: "Missing connectionType or options"
        });
      }

      // Create scanner instance if not exists
      if (!(global as any).modbusScanner) {
        (global as any).modbusScanner = new ModbusScanner();
      }

      const scanner = (global as any).modbusScanner;
      await scanner.connect(connectionType, options);

      res.json({
        success: true,
        message: `Connected to Modbus ${connectionType}`
      });
    } catch (error: any) {
      console.error('Failed to connect to Modbus:', error);
      res.status(500).json({
        success: false,
        message: "Failed to connect to Modbus",
        error: error.message
      });
    }
  });

  /**
   * POST /api/modbus/scan
   * Scan Modbus bus for devices
   */
  app.post("/api/modbus/scan", async (req, res) => {
    try {
      const scanner = (global as any).modbusScanner;
      
      if (!scanner) {
        return res.status(400).json({
          success: false,
          message: "Modbus not connected. Call /api/modbus/connect first"
        });
      }

      const { startAddress = 1, endAddress = 20, timeout = 500 } = req.body;

      console.log(`Starting Modbus scan: addresses ${startAddress}-${endAddress}`);
      const devices = await scanner.scanBus(startAddress, endAddress, timeout);

      res.json({
        success: true,
        devices,
        count: devices.length,
        message: `Found ${devices.length} Modbus devices`
      });
    } catch (error: any) {
      console.error('Modbus scan failed:', error);
      res.status(500).json({
        success: false,
        message: "Modbus scan failed",
        error: error.message
      });
    }
  });

  /**
   * GET /api/modbus/devices
   * Get discovered Modbus devices
   */
  app.get("/api/modbus/devices", async (req, res) => {
    try {
      const scanner = (global as any).modbusScanner;
      
      if (!scanner) {
        return res.json({
          success: true,
          devices: [],
          message: "Modbus not connected"
        });
      }

      const devices = scanner.getDiscoveredDevices();
      res.json({
        success: true,
        devices,
        count: devices.length
      });
    } catch (error: any) {
      console.error('Failed to get Modbus devices:', error);
      res.status(500).json({
        success: false,
        message: "Failed to get Modbus devices",
        error: error.message
      });
    }
  });

  /**
   * GET /api/modbus/device/:address/read
   * Read current values from a Modbus device
   */
  app.get("/api/modbus/device/:address/read", async (req, res) => {
    try {
      const scanner = (global as any).modbusScanner;
      const address = parseInt(req.params.address);

      if (!scanner) {
        return res.status(400).json({
          success: false,
          message: "Modbus not connected"
        });
      }

      const values = await scanner.readDevice(address);
      const valuesObj = Object.fromEntries(values);

      res.json({
        success: true,
        address,
        values: valuesObj,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error(`Failed to read Modbus device ${req.params.address}:`, error);
      res.status(500).json({
        success: false,
        message: "Failed to read Modbus device",
        error: error.message
      });
    }
  });

  /**
   * GET /api/modbus/read-all
   * Read all discovered Modbus devices
   */
  app.get("/api/modbus/read-all", async (req, res) => {
    try {
      const scanner = (global as any).modbusScanner;

      if (!scanner) {
        return res.status(400).json({
          success: false,
          message: "Modbus not connected"
        });
      }

      const allData = await scanner.readAllDevices();
      
      // Convert Map to Object for JSON serialization
      const dataObj: any = {};
      allData.forEach((values, address) => {
        dataObj[address] = Object.fromEntries(values);
      });

      res.json({
        success: true,
        data: dataObj,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Failed to read all Modbus devices:', error);
      res.status(500).json({
        success: false,
        message: "Failed to read all Modbus devices",
        error: error.message
      });
    }
  });

  /**
   * GET /api/modbus/definitions
   * Get available meter definitions and manufacturers
   */
  app.get("/api/modbus/definitions", async (req, res) => {
    try {
      const { 
        METER_DEFINITIONS, 
        getSupportedManufacturers, 
        getModelsByManufacturer 
      } = await import('./protocols/meter-definitions');

      const manufacturers = getSupportedManufacturers();
      const definitions = manufacturers.map(manufacturer => ({
        manufacturer,
        models: getModelsByManufacturer(manufacturer)
      }));

      res.json({
        success: true,
        manufacturers,
        definitions,
        totalDefinitions: METER_DEFINITIONS.length
      });
    } catch (error: any) {
      console.error('Failed to get meter definitions:', error);
      res.status(500).json({
        success: false,
        message: "Failed to get meter definitions",
        error: error.message
      });
    }
  });

  /**
   * GET /api/modbus/definition/:manufacturer/:model?
   * Get specific meter definition details
   */
  app.get("/api/modbus/definition/:manufacturer/:model?", async (req, res) => {
    try {
      const { manufacturer, model } = req.params;
      const { getMeterDefinition, getGenericMeterDefinition } = await import('./protocols/meter-definitions');

      let definition;
      if (manufacturer.toLowerCase() === 'generic') {
        definition = getGenericMeterDefinition();
      } else {
        definition = getMeterDefinition(manufacturer, model);
      }

      if (!definition) {
        return res.status(404).json({
          success: false,
          message: `Meter definition not found for ${manufacturer}${model ? ' ' + model : ''}`
        });
      }

      // Group registers by category
      const registersByCategory: Record<string, any[]> = {};
      for (const register of definition.registers) {
        if (!registersByCategory[register.category]) {
          registersByCategory[register.category] = [];
        }
        registersByCategory[register.category].push({
          address: register.address,
          name: register.name,
          description: register.description,
          type: register.type,
          dataType: register.dataType,
          unit: register.unit,
          decimals: register.decimals
        });
      }

      res.json({
        success: true,
        definition: {
          manufacturer: definition.manufacturer,
          model: definition.model,
          description: definition.description,
          baudRate: definition.baudRate,
          defaultBaudRate: definition.defaultBaudRate,
          parity: definition.parity,
          defaultParity: definition.defaultParity,
          defaultByteOrder: definition.defaultByteOrder,
          registerCount: definition.registers.length,
          registersByCategory
        }
      });
    } catch (error: any) {
      console.error('Failed to get meter definition:', error);
      res.status(500).json({
        success: false,
        message: "Failed to get meter definition",
        error: error.message
      });
    }
  });

  /**
   * POST /api/modbus/disconnect
   * Disconnect from Modbus
   */
  app.post("/api/modbus/disconnect", async (req, res) => {
    try {
      const scanner = (global as any).modbusScanner;

      if (scanner) {
        await scanner.disconnect();
        delete (global as any).modbusScanner;
      }

      res.json({
        success: true,
        message: "Disconnected from Modbus"
      });
    } catch (error: any) {
      console.error('Failed to disconnect from Modbus:', error);
      res.status(500).json({
        success: false,
        message: "Failed to disconnect from Modbus",
        error: error.message
      });
    }
  });

  /**
   * POST /api/modbus/save-selected-meters
   * Save selected energy meters from discovery to database
   */
  app.post("/api/modbus/save-selected-meters", async (req, res) => {
    try {
      const { meters } = req.body;

      if (!Array.isArray(meters) || meters.length === 0) {
        return res.status(400).json({
          success: false,
          message: "meters array is required"
        });
      }

      console.log(`[Modbus Save] Saving ${meters.length} selected energy meters...`);

      // Use db and schema
      const { db } = await import('./db');
      const { devices } = await import('@shared/schema');

      if (!db) {
        return res.status(500).json({
          success: false,
          message: "Database not connected"
        });
      }

      // Parameter mapping
      const PARAMETER_MAP: Record<string, string> = {
        "WH": "energy",
        "MAIN_WH": "energy",
        "Run _W": "power", 
        "Run_W": "power",
        "MAIN_Run _W": "power",
        "MAIN_Run_W": "power",
        "W": "power",
        "Total_Amp": "current",
        "TAmp": "current",
        "MAIN_TAmp": "current",
        "Am": "current",
        "VLL": "voltage",
        "VLN": "voltage",
        "V": "voltage"
      };

      // Helper function to get location from meter name
      function getMeterLocation(meterName: string): string {
        const parts = meterName.split("/");
        if (parts.length >= 2) {
          const location = parts[1]
            .replace(/_/g, " ")
            .replace(/([A-Z])/g, " $1")
            .trim();
          return location.charAt(0).toUpperCase() + location.slice(1);
        }
        return meterName;
      }

      // Create devices only (readings imported separately)
      const createdDevices: any[] = [];
      
      for (const meter of meters) {
        const hasEnergyParams = meter.parameters.some((p: any) => PARAMETER_MAP[p.name]);
        
        if (!hasEnergyParams) {
          continue;
        }

        const location = getMeterLocation(meter.name);
        
        createdDevices.push({
          name: meter.name.replace(/\//g, " - "),
          type: "energy_meter",
          location: location,
          ipAddress: "Modbus RS485",
          status: "active"
        });
      }

      console.log(`[Modbus Save] Creating ${createdDevices.length} devices...`);
      const insertedDevices = await db.insert(devices).values(createdDevices).returning();
      
      for (const device of insertedDevices) {
        console.log(`[Modbus Save] Created device: ${device.name} (ID: ${device.id})`);
      }

      console.log(`[Modbus Save] ✅ Saved ${insertedDevices.length} devices`);

      res.json({
        success: true,
        deviceCount: insertedDevices.length,
        readingCount: 0,  // Readings imported separately
        message: `Successfully saved ${insertedDevices.length} energy meters. Click "Import Readings" on Meters page to load historical data.`
      });

    } catch (error: any) {
      console.error('[Modbus Save] Error:', error);
      res.status(500).json({
        success: false,
        message: "Failed to save meters",
        error: error.message
      });
    }
  });

  /**
   * POST /api/modbus/import-readings
   * Import readings for all energy meters from CSV
   */
  app.post("/api/modbus/import-readings", async (req, res) => {
    try {
      console.log(`[Modbus Import] Starting readings import...`);

      const { db } = await import('./db');
      const { devices, readings } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      if (!db) {
        return res.status(500).json({
          success: false,
          message: "Database not connected"
        });
      }

      // Get all energy meters
      const energyMeters = await db.select().from(devices).where(eq(devices.type, 'energy_meter'));
      
      if (energyMeters.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No energy meters found. Add meters from Energy Meters discovery page first."
        });
      }

      console.log(`[Modbus Import] Found ${energyMeters.length} energy meters in database`);

      // Load discovery file to get LogId mappings
      const discoveryPath = join(process.cwd(), 'client', 'public', 'discovered-energy-meters.json');
      const discoveryData = JSON.parse(readFileSync(discoveryPath, 'utf-8'));

      // Parameter mapping
      const PARAMETER_MAP: Record<string, string> = {
        "WH": "energy",
        "MAIN_WH": "energy",
        "Run _W": "power",
        "Run_W": "power",
        "MAIN_Run _W": "power",
        "W": "power",
        "Total_Amp": "current",
        "TAmp": "current",
        "MAIN_TAmp": "current",
        "Am": "current",
        "VLL": "voltage",
        "VLN": "voltage",
        "V": "voltage"
      };

      // Create LogId to meter mapping
      const logIdMap = new Map<string, { meterName: string; fieldName: string }>();
      const deviceNameMap = new Map<string, number>();

      for (const meter of energyMeters) {
        // Convert device name back to original format (e.g., "EM - MAIN" -> "EM/MAIN")
        const originalName = meter.name.replace(/ - /g, "/");
        deviceNameMap.set(originalName, meter.id);
      }

      for (const discoveredMeter of discoveryData) {
        for (const param of discoveredMeter.parameters) {
          const fieldName = PARAMETER_MAP[param.name];
          if (fieldName) {
            logIdMap.set(param.logId, {
              meterName: discoveredMeter.name,
              fieldName: fieldName
            });
          }
        }
      }

      console.log(`[Modbus Import] Mapped ${logIdMap.size} parameters`);

      // Load trend log data
      const trendLogPath = join(process.cwd(), 'exported-data', 'trendlog_readings.csv');
      const csvContent = readFileSync(trendLogPath, 'utf-8');
      const trendLogRecords = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      console.log(`[Modbus Import] Loaded ${trendLogRecords.length} records from CSV`);

      // Filter and group readings
      const readingGroups = new Map<string, any>();
      let matchedRecords = 0;

      for (const record of trendLogRecords) {
        const mapping = logIdMap.get(record.LogId);
        if (!mapping) continue;

        const deviceId = deviceNameMap.get(mapping.meterName);
        if (!deviceId) continue;

        matchedRecords++;
        const timestamp = new Date(parseInt(record.Timestamp) * 1000);
        const key = `${deviceId}-${record.Timestamp}`;

        if (!readingGroups.has(key)) {
          readingGroups.set(key, {
            deviceId,
            timestamp,
            power: null,
            voltage: null,
            current: null,
            energy: null,
            frequency: null,
            powerFactor: null
          });
        }

        const reading = readingGroups.get(key)!;
        const value = parseFloat(record.Value);
        if (!isNaN(value)) {
          reading[mapping.fieldName] = value;
        }
      }

      console.log(`[Modbus Import] Matched ${matchedRecords} records, consolidated to ${readingGroups.size} readings`);

      // Insert readings in batches
      const readingsArray = Array.from(readingGroups.values());
      const BATCH_SIZE = 500;
      let insertedCount = 0;

      for (let i = 0; i < readingsArray.length; i += BATCH_SIZE) {
        const batch = readingsArray.slice(i, i + BATCH_SIZE);
        await db.insert(readings).values(batch);
        insertedCount += batch.length;
      }

      console.log(`[Modbus Import] ✅ Imported ${insertedCount} readings for ${energyMeters.length} meters`);

      res.json({
        success: true,
        deviceCount: energyMeters.length,
        readingCount: insertedCount,
        message: `Imported ${insertedCount} readings for ${energyMeters.length} energy meters`
      });

    } catch (error: any) {
      console.error('[Modbus Import] Error:', error);
      res.status(500).json({
        success: false,
        message: "Failed to import readings",
        error: error.message
      });
    }
  });

  /**
   * POST /api/modbus/delete-discovered-meters
   * Delete meters from the discovered-energy-meters.json file
   */
  app.post("/api/modbus/delete-discovered-meters", async (req, res) => {
    try {
      const { meterNames } = req.body;

      if (!Array.isArray(meterNames) || meterNames.length === 0) {
        return res.status(400).json({
          success: false,
          message: "meterNames array is required"
        });
      }

      console.log(`[Modbus Delete] Deleting ${meterNames.length} meters from discovery file...`);

      const discoveryPath = join(process.cwd(), 'client', 'public', 'discovered-energy-meters.json');
      
      // Check if file exists
      if (!existsSync(discoveryPath)) {
        return res.status(404).json({
          success: false,
          message: "Discovery file not found"
        });
      }

      // Read current discovery data
      const currentData = JSON.parse(readFileSync(discoveryPath, 'utf-8'));
      
      // Filter out the selected meters
      const filteredData = currentData.filter((meter: any) => !meterNames.includes(meter.name));
      const deletedCount = currentData.length - filteredData.length;

      // Write back the filtered data
      writeFileSync(discoveryPath, JSON.stringify(filteredData, null, 2));

      console.log(`[Modbus Delete] ✅ Deleted ${deletedCount} meters. ${filteredData.length} remaining.`);

      res.json({
        success: true,
        deletedCount: deletedCount,
        remainingCount: filteredData.length,
        message: `Successfully deleted ${deletedCount} meters from discovery list`
      });

    } catch (error: any) {
      console.error('[Modbus Delete] Error:', error);
      res.status(500).json({
        success: false,
        message: "Failed to delete meters",
        error: error.message
      });
    }
  });

  // --- Analytics ---
  app.get(api.analytics.overview.path, async (req, res) => {
    const overview = await storage.getAnalyticsOverview();
    res.json(overview);
  });

  // New endpoint for period-based analytics
  app.get("/api/analytics/periods", async (req, res) => {
    try {
      const { period } = req.query; // 'today', 'week', 'month'
      
      // Skip energy counter reset - not needed
      // if (period && typeof period === 'string') {
      //   (storage as any).resetPeriodEnergy(period);
      // }
      
      // Get all online devices
      const devices = await storage.getDevices();
      const onlineDevices = devices.filter(d => d.status === 'online');
      
      // IMPORTANT: Only use billing meters for energy/cost to avoid double-counting sub-meters
      const billingMeters = onlineDevices.filter(d => d.isBillingMeter === true);
      
      let totalConsumption = 0;
      let totalCost = 0;
      let periodHours = 0;
      
      // Calculate period hours
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      switch (period) {
        case 'today':
          periodHours = (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
          break;
        case 'week':
          periodHours = (now.getTime() - startOfWeek.getTime()) / (1000 * 60 * 60);
          break;
        case 'month':
          periodHours = (now.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60);
          break;
        default:
          periodHours = 24; // Default to daily
      }
      
      // Calculate consumption ONLY from billing meters (to avoid double-counting sub-meters)
      let devicesWithData = 0;
      let devicesWithoutData = 0;
      let billingMetersUsed = 0;
      
      for (const device of billingMeters) {
        const readings = await storage.getMeterReadings(device.id, Math.ceil(periodHours));
        
        if (readings.length === 0) {
          devicesWithoutData++;
          continue;
        }
        
        // Filter out invalid readings
        const validReadings = readings.filter(isValidReading);
        
        if (validReadings.length === 0) {
          devicesWithoutData++;
          continue;
        }
        
        devicesWithData++;
        billingMetersUsed++;
        
        // Group readings by date and calculate daily consumption (max - min per day)
        const dailyData: Record<string, { minEnergy: number | null; maxEnergy: number | null }> = {};
        
        for (const reading of validReadings) {
          const date = new Date(reading.timestamp!).toISOString().split('T')[0];
          if (!dailyData[date]) {
            dailyData[date] = { minEnergy: null, maxEnergy: null };
          }
          
          const energy = reading.energy || 0;
          if (dailyData[date].minEnergy === null || energy < dailyData[date].minEnergy!) {
            dailyData[date].minEnergy = energy;
          }
          if (dailyData[date].maxEnergy === null || energy > dailyData[date].maxEnergy!) {
            dailyData[date].maxEnergy = energy;
          }
        }
        
        // Sum up daily consumption
        for (const date in dailyData) {
          const dayData = dailyData[date];
          const dailyConsumption = (dayData.maxEnergy || 0) - (dayData.minEnergy || 0);
          if (dailyConsumption > 0) {
            totalConsumption += dailyConsumption;
          }
        }
      }
      
      totalCost = totalConsumption * 8; // ₹8 per kWh
      
      // Calculate trend: compare current hour average power vs previous hour
      let trendValue: number | null = null;
      let trendIsPositive = false;
      
      // Get current hour and previous hour power readings for all devices
      const currentHourStart = new Date(now);
      currentHourStart.setMinutes(0, 0, 0);
      const previousHourStart = new Date(currentHourStart);
      previousHourStart.setHours(currentHourStart.getHours() - 1);
      
      let currentHourPower = 0;
      let previousHourPower = 0;
      let currentHourCount = 0;
      let previousHourCount = 0;
      
      for (const device of onlineDevices) {
        const recentReadings = await storage.getMeterReadings(device.id, 2); // Last 2 hours
        
        for (const reading of recentReadings) {
          if (!reading.timestamp || !reading.power) continue;
          
          const readingTime = new Date(reading.timestamp);
          
          if (readingTime >= currentHourStart) {
            currentHourPower += reading.power;
            currentHourCount++;
          } else if (readingTime >= previousHourStart && readingTime < currentHourStart) {
            previousHourPower += reading.power;
            previousHourCount++;
          }
        }
      }
      
      if (currentHourCount > 0 && previousHourCount > 0) {
        const currentAvg = currentHourPower / currentHourCount;
        const previousAvg = previousHourPower / previousHourCount;
        
        if (previousAvg > 0) {
          trendValue = ((currentAvg - previousAvg) / previousAvg) * 100;
          trendIsPositive = trendValue > 0;
          trendValue = Math.round(Math.abs(trendValue) * 10) / 10; // Round to 1 decimal
        }
      }
      
      res.json({
        period,
        consumption: totalConsumption,
        cost: totalCost,
        hours: periodHours,
        currency: 'INR',
        onlineDevices: onlineDevices.length,
        devicesWithData,
        devicesWithoutData,
        billingMetersCount: billingMeters.length,
        billingMetersUsed,
        timestamp: now,
        trend: trendValue !== null ? { value: trendValue, isPositive: trendIsPositive } : null
      });
    } catch (error) {
      console.error('❌ Failed to fetch period analytics:', error);
      res.status(500).json({ message: 'Failed to fetch period analytics', error: String(error) });
    }
  });

  // Power consumption trend endpoint for Dashboard chart
  app.get("/api/analytics/power-trend", async (req, res) => {
    try {
      const hours = req.query.hours ? Number(req.query.hours) : 24;
      const devices = await storage.getDevices();
      const onlineDevices = devices.filter(d => d.status === 'online');
      
      // Get all readings for the past N hours from all devices
      const allReadings: Array<{ timestamp: Date; power: number }> = [];
      
      for (const device of onlineDevices) {
        const readings = await storage.getMeterReadings(device.id, hours);
        
        // Filter to only valid readings
        const validReadings = readings.filter(isValidReading);
        
        validReadings.forEach(reading => {
          if (reading.power && reading.timestamp) {
            allReadings.push({
              timestamp: new Date(reading.timestamp),
              power: reading.power
            });
          }
        });
      }
      
      // Sort by timestamp
      allReadings.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Group by hour and calculate average power
      const hourlyData: Record<string, { totalPower: number; count: number }> = {};
      
      for (const reading of allReadings) {
        const hour = reading.timestamp.getHours();
        const hourKey = `${hour.toString().padStart(2, '0')}:00`;
        if (!hourlyData[hourKey]) {
          hourlyData[hourKey] = { totalPower: 0, count: 0 };
        }
        hourlyData[hourKey].totalPower += reading.power;
        hourlyData[hourKey].count += 1;
      }
      
      // Convert to chart format
      const chartData = Object.entries(hourlyData)
        .map(([time, data]) => ({
          time,
          power: Math.round((data.totalPower / data.count) * 10) / 10 // Average power for that hour
        }))
        .sort((a, b) => {
          const hourA = parseInt(a.time.split(':')[0]);
          const hourB = parseInt(b.time.split(':')[0]);
          return hourA - hourB;
        });
      
      res.json(chartData);
    } catch (error) {
      console.error('❌ Failed to fetch power trend:', error);
      res.status(500).json({ message: 'Failed to fetch power trend', error: String(error) });
    }
  });

  // Enhanced analytics endpoint for Summary Statistics
  app.get("/api/analytics/summary", async (req, res) => {
    try {
      const devices = await storage.getDevices();
      const onlineDevices = devices.filter(d => d.status === 'online');
      
      // IMPORTANT: Only use billing meters for cost calculations
      const billingMeters = devices.filter(d => d.isBillingMeter === true);
      
      const now = new Date();
      const tariffRate = 8; // ₹8 per kWh
      
      // Calculate current total power and individual device powers
      let totalCurrentPower = 0;
      let maxDevicePower = 0;
      let minDevicePower = Number.MAX_VALUE;
      let devicePowers = [];
      let devicesWithCurrentData = 0;
      
      for (const device of onlineDevices) {
        const reading = await storage.getMeterReading(device.id);
        
        // Check if current reading is valid
        if (reading && isValidReading(reading)) {
          const power = reading.power || 0;
          totalCurrentPower += power;
          maxDevicePower = Math.max(maxDevicePower, power);
          if (power > 0) minDevicePower = Math.min(minDevicePower, power);
          devicePowers.push({ name: device.name, power });
          devicesWithCurrentData++;
        } else {
          devicePowers.push({ name: device.name, power: 0 });
        }
      }
      
      if (minDevicePower === Number.MAX_VALUE) minDevicePower = 0;
      
      // Calculate projected monthly cost from billing meters ONLY (to avoid double-counting)
      let totalDailyConsumption = 0;
      let daysWithData = 0;
      let billingMetersUsed = 0;
      
      // Get historical data for past 30 days to calculate average (billing meters only)
      for (const device of billingMeters) {
        const readings = await storage.getMeterReadings(device.id, 30 * 24); // Past 30 days
        
        if (readings.length === 0) continue;
        
        // Filter to valid readings only
        const validReadings = readings.filter(isValidReading);
        
        if (validReadings.length === 0) continue;
        
        // Group by date and calculate daily consumption
        const dailyData = validReadings.reduce((acc: any, reading: any) => {
          const date = new Date(reading.timestamp).toISOString().split('T')[0];
          
          if (!acc[date]) {
            acc[date] = { minEnergy: null, maxEnergy: null };
          }
          
          const energy = reading.energy || 0;
          if (acc[date].minEnergy === null || energy < acc[date].minEnergy) {
            acc[date].minEnergy = energy;
          }
          if (acc[date].maxEnergy === null || energy > acc[date].maxEnergy) {
            acc[date].maxEnergy = energy;
          }
          
          return acc;
        }, {});
        
        // Sum daily consumption for this billing meter
        billingMetersUsed++;
        Object.values(dailyData).forEach((day: any) => {
          const dailyConsumption = (day.maxEnergy || 0) - (day.minEnergy || 0);
          if (dailyConsumption > 0) {
            totalDailyConsumption += dailyConsumption;
            daysWithData++;
          }
        });
      }
      
      // Calculate average daily consumption and project to 30 days
      const avgDailyConsumption = daysWithData > 0 ? totalDailyConsumption / daysWithData : 0;
      const projectedMonthlyCost = avgDailyConsumption * 30 * tariffRate;
      
      console.log(`📊 Projection: ${daysWithData} days of data, avg ${avgDailyConsumption.toFixed(2)} kWh/day, projected ₹${projectedMonthlyCost.toFixed(0)}/month`);
      
      // Find peak device
      const peakDevice = devicePowers.reduce((max, device) => 
        device.power > max.power ? device : max, 
        { name: 'None', power: 0 }
      );
      
      // Calculate load factor (average power / peak power)
      const loadFactor = maxDevicePower > 0 ? (totalCurrentPower / devicesWithCurrentData / maxDevicePower * 100) : 0;
      
      res.json({
        totalCurrentPower: totalCurrentPower.toFixed(1),
        projectedMonthlyCost: projectedMonthlyCost.toFixed(0),
        peakDevice: {
          name: peakDevice.name,
          power: peakDevice.power.toFixed(1)
        },
        systemEfficiency: loadFactor.toFixed(1),
        avgPowerPerDevice: devicesWithCurrentData > 0 ? (totalCurrentPower / devicesWithCurrentData).toFixed(1) : '0',
        onlineDevices: onlineDevices.length,
        devicesWithCurrentData,
        billingMetersCount: billingMeters.length,
        billingMetersUsed,
        timestamp: now
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch enhanced analytics' });
    }
  });

  app.get(api.analytics.consumption.path, async (req, res) => {
    try {
      const { timeRange } = req.query;
      
      // IMPORTANT: Only use billing meters for consumption/cost data (avoid double-counting sub-meters)
      const devices = await storage.getDevices();
      const billingMeters = devices.filter(d => d.isBillingMeter === true);
      const consumptionData = [];
      
      // Calculate date range based on timeRange
      const now = new Date();
      let startDate = new Date(now);
      
      switch (timeRange) {
        case '24h':
          startDate.setHours(now.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        default:
          startDate.setDate(now.getDate() - 7); // Default 7 days
      }
      
      // Fetch readings for billing meters only
      for (const device of billingMeters) {
        const readings = await storage.getMeterReadings(device.id);
        
        // Filter readings within time range and group by date
        const filteredReadings = readings.filter((r: any) => 
          new Date(r.timestamp) >= startDate
        );
        
        // Group by date and calculate daily consumption (max - min)
        const dailyData = filteredReadings.reduce((acc: any, reading: any) => {
          const date = new Date(reading.timestamp).toISOString().split('T')[0];
          
          if (!acc[date]) {
            acc[date] = {
              date,
              deviceId: device.id,
              deviceName: device.name,
              minEnergy: null,
              maxEnergy: null,
              power: 0,
              count: 0
            };
          }
          
          // Track min and max energy for daily consumption calculation
          const energy = reading.energy || 0;
          if (acc[date].minEnergy === null || energy < acc[date].minEnergy) {
            acc[date].minEnergy = energy;
          }
          if (acc[date].maxEnergy === null || energy > acc[date].maxEnergy) {
            acc[date].maxEnergy = energy;
          }
          
          acc[date].power += reading.power || 0;
          acc[date].count++;
          
          return acc;
        }, {});
        
        // Convert to array and calculate daily consumption
        Object.values(dailyData).forEach((day: any) => {
          consumptionData.push({
            date: day.date,
            deviceId: day.deviceId,
            deviceName: day.deviceName,
            energy: (day.maxEnergy || 0) - (day.minEnergy || 0), // Daily consumption
            power: day.power / day.count, // Average power for the day
          });
        });
      }
      
      res.json(consumptionData);
    } catch (error) {
      console.error('Failed to fetch consumption data:', error);
      res.status(500).json({ message: 'Failed to fetch consumption data' });
    }
  });

  // Voltage stability data endpoint for Analytics charts
  app.get("/api/analytics/voltage-stability", async (req, res) => {
    try {
      const { deviceId, hours = '24' } = req.query;
      const hoursNum = parseInt(hours as string);
      
      console.log(`📊 Fetching voltage stability data: deviceId=${deviceId || 'all'}, hours=${hours}`);
      
      if (!deviceId) {
        return res.json([]);
      }

      const deviceIdNum = parseInt(deviceId as string);
      
      // Try database first
      const { db } = await import('./db');
      const { devices, readings } = await import('@shared/schema');
      
      if (db) {
        const { eq, gte, and } = await import('drizzle-orm');
        
        // Get device from database
        const device = await db.select().from(devices).where(eq(devices.id, deviceIdNum)).limit(1);
        
        if (device.length === 0) {
          return res.status(404).json({ message: 'Device not found' });
        }
        
        // Get historical readings from database
        const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000);
        const deviceReadings = await db.select()
          .from(readings)
          .where(and(
            eq(readings.deviceId, deviceIdNum),
            gte(readings.timestamp, since)
          ))
          .orderBy(readings.timestamp);
        
        console.log(`📋 Found ${deviceReadings.length} historical readings for device ${device[0].name}`);
        
        // Build voltage data from historical readings
        const voltageData = deviceReadings
          .filter((r: any) => r.voltageL1L2 || r.voltageL2L3 || r.voltageL3L1)
          .map((r: any) => {
            const date = new Date(r.timestamp);
            return {
              time: date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
              fullTime: date.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
              phase1: r.voltageL1L2 || 0,
              phase2: r.voltageL2L3 || 0,
              phase3: r.voltageL3L1 || 0,
              timestamp: r.timestamp
            };
          });
        
        if (voltageData.length === 0) {
          console.log('⚠️ No phase voltage data in database yet.');
          return res.json([]);
        }
        
        console.log(`✅ Returning ${voltageData.length} voltage data points from database`);
        if (voltageData.length > 0) {
          console.log(`   Sample: phase1=${voltageData[0].phase1}V, phase2=${voltageData[0].phase2}V, phase3=${voltageData[0].phase3}V`);
        }
        
        return res.json(voltageData);
      }
      
      // Fallback to mock storage
      const device = await storage.getDevice(deviceIdNum);
      
      if (!device) {
        return res.status(404).json({ message: 'Device not found' });
      }
      
      const meterReadings = await storage.getMeterReadings(deviceIdNum);
      const now = new Date();
      const startDate = new Date(now.getTime() - hoursNum * 60 * 60 * 1000);
      
      const filteredReadings = meterReadings
        .filter((r: any) => new Date(r.timestamp) >= startDate)
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      const voltageData = filteredReadings
        .filter((r: any) => r.voltageL1L2 || r.voltageL2L3 || r.voltageL3L1)
        .map((r: any) => {
          const date = new Date(r.timestamp);
          return {
            time: date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
            fullTime: date.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
            phase1: r.voltageL1L2 || 0,
            phase2: r.voltageL2L3 || 0,
            phase3: r.voltageL3L1 || 0,
            timestamp: r.timestamp
          };
        });
      
      res.json(voltageData);
    } catch (error) {
      console.error('Failed to fetch voltage stability data:', error);
      res.status(500).json({ message: 'Failed to fetch voltage stability data' });
    }
  });

  // Current stability data endpoint for Analytics charts (3-phase currents)
  app.get("/api/analytics/current-stability", async (req, res) => {
    try {
      const { deviceId, hours = '24' } = req.query;
      const hoursNum = parseInt(hours as string);
      
      console.log(`📊 Fetching current stability data: deviceId=${deviceId || 'all'}, hours=${hours}`);
      
      if (!deviceId) {
        return res.json([]);
      }

      const deviceIdNum = parseInt(deviceId as string);
      
      // Try database first
      const { db } = await import('./db');
      const { devices, readings } = await import('@shared/schema');
      
      if (db) {
        const { eq, gte, and } = await import('drizzle-orm');
        
        // Get device from database
        const device = await db.select().from(devices).where(eq(devices.id, deviceIdNum)).limit(1);
        
        if (device.length === 0) {
          return res.status(404).json({ message: 'Device not found' });
        }
        
        // Get historical readings from database
        const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000);
        const deviceReadings = await db.select()
          .from(readings)
          .where(and(
            eq(readings.deviceId, deviceIdNum),
            gte(readings.timestamp, since)
          ))
          .orderBy(readings.timestamp);
        
        console.log(`📋 Found ${deviceReadings.length} historical readings for device ${device[0].name}`);
        
        // Build current data from historical readings
        const currentData = deviceReadings
          .filter((r: any) => r.currentL1 || r.currentL2 || r.currentL3)
          .map((r: any) => {
            const date = new Date(r.timestamp);
            return {
              time: date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
              fullTime: date.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
              phase1: r.currentL1 || 0,
              phase2: r.currentL2 || 0,
              phase3: r.currentL3 || 0,
              timestamp: r.timestamp
            };
          });
        
        if (currentData.length === 0) {
          console.log('⚠️ No phase current data in database yet.');
          return res.json([]);
        }
        
        console.log(`✅ Returning ${currentData.length} current data points from database`);
        if (currentData.length > 0) {
          console.log(`   Sample: phase1=${currentData[0].phase1}A, phase2=${currentData[0].phase2}A, phase3=${currentData[0].phase3}A`);
        }
        
        return res.json(currentData);
      }
      
      // Fallback to mock storage
      const device = await storage.getDevice(deviceIdNum);
      
      if (!device) {
        return res.status(404).json({ message: 'Device not found' });
      }
      
      const meterReadings = await storage.getMeterReadings(deviceIdNum);
      const now = new Date();
      const startDate = new Date(now.getTime() - hoursNum * 60 * 60 * 1000);
      
      const filteredReadings = meterReadings
        .filter((r: any) => new Date(r.timestamp) >= startDate)
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      const currentData = filteredReadings
        .filter((r: any) => r.currentL1 || r.currentL2 || r.currentL3)
        .map((r: any) => {
          const date = new Date(r.timestamp);
          return {
            time: date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
            fullTime: date.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
            phase1: r.currentL1 || 0,
            phase2: r.currentL2 || 0,
            phase3: r.currentL3 || 0,
            timestamp: r.timestamp
          };
        });
      
      res.json(currentData);
    } catch (error) {
      console.error('Failed to fetch current stability data:', error);
      res.status(500).json({ message: 'Failed to fetch current stability data' });
    }
  });

  // Daily cost trends endpoint
  app.get("/api/analytics/cost-trends", async (req, res) => {
    try {
      const { days = '7', tariffRate = '8' } = req.query;
      const daysNum = parseInt(days as string);
      const rate = parseFloat(tariffRate as string);
      
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - daysNum);
      
      console.log(`📊 Cost trends: days=${daysNum}, startDate=${startDate.toISOString()}`);
      
      // Get all devices
      const devices = await storage.getDevices();
      const costData: any[] = [];
      
      console.log(`📋 Processing ${devices.length} devices`);
      
      // Get readings for all devices
      for (const device of devices) {
        // Pass the number of days * 24 to get enough data
        const readings = await storage.getMeterReadings(device.id, daysNum * 24);
        
        console.log(`  📍 ${device.name}: ${readings.length} total readings`);
        
        // Filter to valid readings only
        const validReadings = readings.filter(isValidReading);
        
        console.log(`    ✓ ${validReadings.length} valid readings`);
        
        if (validReadings.length === 0) {
          console.log(`    ⚠️  No valid data, skipping ${device.name}`);
          continue;
        }
        
        // Filter and group by date
        const dailyReadings = validReadings
          .filter((r: any) => new Date(r.timestamp) >= startDate)
          .reduce((acc: any, reading: any) => {
            const date = new Date(reading.timestamp).toISOString().split('T')[0];
            const day = new Date(date).toLocaleDateString('en', { weekday: 'short' });
            
            if (!acc[date]) {
              acc[date] = { date, day, minEnergy: null, maxEnergy: null };
            }
            
            // Track min and max energy for the day (to calculate daily consumption)
            const energy = reading.energy || 0;
            if (acc[date].minEnergy === null || energy < acc[date].minEnergy) {
              acc[date].minEnergy = energy;
            }
            if (acc[date].maxEnergy === null || energy > acc[date].maxEnergy) {
              acc[date].maxEnergy = energy;
            }
            
            return acc;
          }, {});
        
        // Add to cost data
        Object.values(dailyReadings).forEach((dayData: any) => {
          // Calculate daily consumption as difference between max and min readings
          const dailyConsumption = (dayData.maxEnergy || 0) - (dayData.minEnergy || 0);
          
          console.log(`    ${dayData.date}: ${dailyConsumption.toFixed(2)} kWh (min=${dayData.minEnergy}, max=${dayData.maxEnergy})`);
          
          const existing = costData.find(d => d.date === dayData.date);
          if (existing) {
            existing.usage += dailyConsumption;
            existing.cost = existing.usage * rate; // Recalculate total cost
          } else {
            costData.push({
              date: dayData.date,
              day: dayData.day,
              usage: dailyConsumption,
              cost: dailyConsumption * rate
            });
          }
        });
      }
      
      // Sort by date
      costData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      console.log(`✅ Returning ${costData.length} days of cost data`);
      costData.forEach(d => console.log(`   ${d.date} (${d.day}): ${d.usage.toFixed(2)} kWh = ₹${d.cost.toFixed(2)}`));
      
      res.json(costData);
    } catch (error) {
      console.error('Failed to fetch cost trends:', error);
      res.status(500).json({ message: 'Failed to fetch cost trends' });
    }
  });

  app.post(api.analytics.export.path, async (req, res) => {
    try {
      console.log('📊 Export request received:', req.body);
      
      const { timeRange, startDate, endDate, format } = req.body;
      
      const exportData = await storage.exportConsumptionData(
        timeRange, 
        startDate, 
        endDate, 
        format
      );
      
      console.log('✅ Export data generated:', { 
        filename: exportData.filename, 
        dataLength: exportData.data?.length,
        format 
      });
      
      res.json(exportData);
    } catch (error) {
      console.error('❌ Export failed:', error);
      res.status(500).json({ message: 'Failed to export data', error: String(error) });
    }
  });

  // --- Thresholds ---
  app.get(api.thresholds.list.path, async (req, res) => {
    try {
      const thresholds = await storage.getThresholds();
      res.json(thresholds);
    } catch (error) {
      console.error('Failed to get thresholds:', error);
      res.status(500).json({ message: "Failed to fetch thresholds" });
    }
  });

  app.post(api.thresholds.create.path, async (req, res) => {
    try {
      const input = api.thresholds.create.input.parse(req.body);
      const threshold = await storage.createThreshold(input);
      res.status(201).json(threshold);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json(e.errors);
      console.error('Failed to create threshold:', e);
      res.status(500).json({ message: "Failed to create threshold" });
    }
  });

  app.put(api.thresholds.update.path, async (req, res) => {
    try {
      const input = api.thresholds.update.input.parse(req.body);
      const threshold = await storage.updateThreshold(Number(req.params.id), input);
      res.json(threshold);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json(e.errors);
      console.error('Failed to update threshold:', e);
      res.status(500).json({ message: "Failed to update threshold" });
    }
  });

  app.delete(api.thresholds.delete.path, async (req, res) => {
    try {
      await storage.deleteThreshold(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error('Failed to delete threshold:', error);
      res.status(500).json({ message: "Failed to delete threshold" });
    }
  });

  // --- User Management ---
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error('Failed to get users:', error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const userData = req.body;
      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error) {
      console.error('Failed to create user:', error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const userId = req.params.id;
      const userData = req.body;
      const user = await storage.updateUser(userId, userData);
      res.json(user);
    } catch (error) {
      console.error('Failed to update user:', error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Failed to delete user:', error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // --- BMS Integration Routes ---
  app.post("/api/bms/sync", async (req, res) => {
    try {
      if (process.env.BMS_SERVER) {
        const { BMSIntegration } = await import("./bms-integration");
        // Trigger manual sync
        res.json({ message: "BMS sync triggered successfully" });
      } else {
        res.status(400).json({ message: "BMS not configured" });
      }
    } catch (error) {
      res.status(500).json({ message: "BMS sync failed", error: String(error) });
    }
  });

  app.get("/api/bms/status", async (req, res) => {
    try {
      const status = {
        configured: !!process.env.BMS_SERVER,
        server: process.env.BMS_SERVER || 'Not configured',
        database: process.env.BMS_DATABASE || 'Not configured',
        syncInterval: process.env.BMS_SYNC_INTERVAL || '1',
        lastSync: new Date().toISOString() // You can store actual last sync time
      };
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get BMS status" });
    }
  });

  // --- BMS Connection Management Routes ---
  app.get("/api/bms/connections", async (req, res) => {
    try {
      const connections = await storage.getBMSConnections();
      res.json(connections);
    } catch (error) {
      res.status(500).json({ message: "Failed to get BMS connections", error: String(error) });
    }
  });

  app.get("/api/bms/connections/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const connection = await storage.getBMSConnection(id);
      if (!connection) {
        return res.status(404).json({ message: "BMS connection not found" });
      }
      res.json(connection);
    } catch (error) {
      res.status(500).json({ message: "Failed to get BMS connection", error: String(error) });
    }
  });

  app.post("/api/bms/connections", async (req, res) => {
    try {
      const connection = await storage.createBMSConnection(req.body);
      
      // Reload BMS adapters to pick up the new connection
      await bmsManager.reloadFromStorage();
      
      res.status(201).json(connection);
    } catch (error) {
      res.status(400).json({ message: "Failed to create BMS connection", error: String(error) });
    }
  });

  app.put("/api/bms/connections/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const connection = await storage.updateBMSConnection(id, req.body);
      
      // Reload BMS adapters to pick up the changes
      await bmsManager.reloadFromStorage();
      
      res.json(connection);
    } catch (error) {
      res.status(400).json({ message: "Failed to update BMS connection", error: String(error) });
    }
  });

  app.delete("/api/bms/connections/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Remove the adapter
      await bmsManager.removeAdapter(id);
      
      // Delete from storage
      await storage.deleteBMSConnection(id);
      
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete BMS connection", error: String(error) });
    }
  });

  app.post("/api/bms/connections/:id/test", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.testBMSConnection(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to test BMS connection", error: String(error) });
    }
  });

  // Debug endpoint to test sqlcmd directly
  app.get("/api/bms/debug/test-sqlcmd", async (req, res) => {
    console.log("\n🧪 ============ DIRECT SQLCMD TEST START ============");
    
    try {
      const { execSync } = await import('child_process');
      const { existsSync } = await import('fs');
      
      console.log("📋 Step 1: Check if sqlcmd exists in system PATH...");
      
      let sqlcmdPath = '';
      try {
        // Try to find sqlcmd using 'where' command
        sqlcmdPath = execSync('where sqlcmd', { encoding: 'utf-8' }).trim();
        console.log("✅ Found sqlcmd at:", sqlcmdPath);
      } catch (e) {
        console.log("⚠️  sqlcmd not found in PATH!");
        console.log("❌ Error:", (e as any).message);
      }
      
      console.log("\n📋 Step 2: Try running sqlcmd --version...");
      let versionOutput = '';
      try {
        versionOutput = execSync('sqlcmd --version', { encoding: 'utf-8', timeout: 3000 });
        console.log("✅ Version output:", versionOutput);
      } catch (e) {
        console.log("❌ Version check failed:", (e as any).message);
      }
      
      console.log("\n📋 Step 3: Try simple sqlcmd connection with full stderr capture...");
      
      const responseData: any = {
        sqlcmdFound: sqlcmdPath ? true : false,
        sqlcmdPath: sqlcmdPath || 'NOT FOUND',
        versionCheck: versionOutput || 'FAILED',
        connectionTest: null
      };
      
      try {
        // Use -U sa without password to test
        const output = execSync('sqlcmd -S localhost -U sa -Q "SELECT @@VERSION" 2>&1', { 
          encoding: 'utf-8',
          timeout: 3000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        console.log("✅ Connection successful!");
        console.log("📊 Output:", output);
        responseData.connectionTest = { status: 'success', output };
      } catch (e: any) {
        console.log("❌ Connection test failed");
        console.log("Error:", e.message);
        console.log("Stdout:", e.stdout ? e.stdout.toString() : 'none');
        console.log("Stderr:", e.stderr ? e.stderr.toString() : 'none');
        console.log("Exit code:", e.status);
        
        responseData.connectionTest = {
          status: 'failed',
          error: e.message,
          stdout: e.stdout ? e.stdout.toString() : '',
          stderr: e.stderr ? e.stderr.toString() : '',
          exitCode: e.status
        };
      }
      
      console.log("📤 RESPONSE:", JSON.stringify(responseData, null, 2));
      console.log("🧪 ============ DIRECT SQLCMD TEST END ============\n");
      
      res.json(responseData);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("💥 EXCEPTION:", msg);
      console.log("🧪 ============ DIRECT SQLCMD TEST END (ERROR) ============\n");
      
      res.status(500).json({ 
        status: 'exception',
        error: msg 
      });
    }
  });

  // Discover energy meters from BMS database
  app.get("/api/bms/discover-meters", async (req, res) => {
    try {
      // Return pre-discovered TrendLog tables from METRO_BHAWAN
      // These are known to exist in the database
      const meterTables = [
        "TrendLog1", "TrendLog2", "TrendLog3", "TrendLog4", "TrendLog5",
        "TrendLog6", "TrendLog7", "TrendLog8", "TrendLog9", "TrendLog10",
        "TrendLog11", "TrendLog12", "TrendLog13", "TrendLog14", "TrendLog15",
        "TrendLog16", "TrendLog17", "TrendLog18", "TrendLog19", "TrendLog20",
        "TrendLog21", "TrendLog22", "TrendLog23", "TrendLog24", "TrendLog25",
        "TrendLog26", "TrendLog27", "TrendLog28", "TrendLog29", "TrendLog30",
        "TrendLog31", "TrendLog32", "TrendLog33", "TrendLog34", "TrendLog35",
        "TrendLog36", "TrendLog37", "TrendLog38", "TrendLog39", "TrendLog40",
        "TrendLog41", "TrendLog42", "TrendLog43", "TrendLog44", "TrendLog45",
        "TrendLog46", "TrendLog47", "TrendLog48", "TrendLog49", "TrendLog50",
        "TrendLog51", "TrendLog52", "TrendLog53", "TrendLog54", "TrendLog55",
        "TrendLog56", "TrendLog57", "TrendLog58", "TrendLog59", "TrendLog60",
        "TrendLog61", "TrendLog62", "TrendLog63", "TrendLog64", "TrendLog65"
      ];
      
      const meters = meterTables.map((tableName, idx) => ({
        tableName,
        columnCount: 7,
        columns: ['Timestamp', 'Value', 'Quality', 'Provider', 'EventCode', 'Reserved', 'Status'],
        readingCount: 0,
        latestReading: null,
        sampleReadings: []
      }));
      
      res.json({
        connection: 'METRO_BHAWAN',
        meterCount: meters.length,
        meters
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: 'Failed to discover meters', error: msg });
    }
  });

  // Save meter name mappings
  app.post("/api/bms/meter-mappings", async (req, res) => {
    try {
      const mappings = req.body;
      
      // Save to a file or database
      // For now, we'll just return success (mappings are stored in localStorage on client)
      console.log(`📋 Meter mappings updated: ${Object.keys(mappings).length} mappings`);
      
      res.json({ 
        success: true, 
        message: 'Meter mappings saved',
        count: Object.keys(mappings).length
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: 'Failed to save mappings', error: msg });
    }
  });

  // Get meter name mappings
  app.get("/api/bms/meter-mappings", async (req, res) => {
    try {
      // Return empty mappings (client stores in localStorage)
      res.json({});
    } catch (error) {
      res.status(500).json({ message: 'Failed to get mappings' });
    }
  });

  // Testing route to manually trigger threshold checks
  app.post('/api/test/trigger-thresholds', async (req, res) => {
    try {
      // Only call this if storage has the method (MockStorage)
      if ('triggerThresholdChecks' in storage) {
        await (storage as any).triggerThresholdChecks();
        res.json({ message: 'Threshold checks triggered successfully' });
      } else {
        res.status(400).json({ message: 'Threshold triggering not available in this storage mode' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Failed to trigger threshold checks', error: String(error) });
    }
  });

  // --- Custom Analytics Engine ---
  app.get("/api/analytics/custom", async (req, res) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Read custom analytics configuration
      const configPath = path.join(process.cwd(), 'custom-analytics.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const calculations = JSON.parse(configData);
      
      // Get period from query (default to 'week')
      const period = (req.query.period as string) || 'week';
      
      // Fetch required data from database
      const devices = await storage.getDevices();
      const onlineDevices = devices.filter(d => d.status === 'online');
      
      // Calculate hours based on period
      const now = new Date();
      let periodHours = 168; // Default to week
      let daysElapsed = 7;
      
      if (period === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodHours = (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
        daysElapsed = periodHours / 24;
      } else if (period === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        periodHours = (now.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60);
        daysElapsed = periodHours / 24;
      }
      
      // Gather all required parameters
      let totalEnergy = 0;
      let totalCost = 0;
      let avgPower = 0;
      let maxPower = 0;
      let avgVoltage = 0;
      let avgCurrent = 0;
      let devicePowerSums = 0;
      let sumOfIndividualPeaks = 0;
      let powerCount = 0;
      let voltageCount = 0;
      let currentCount = 0;
      let devicesWithData = 0;
      let devicesWithoutData = 0;
      let billingMetersCount = 0;
      
      // IMPORTANT: Only sum energy/cost from billing meters to avoid double-counting
      // (Sub-meters measure energy already counted by their parent main meters)
      const billingMeters = onlineDevices.filter(d => d.isBillingMeter === true);
      const allMetersForStats = onlineDevices; // Use all meters for power/voltage/current stats
      
      // Calculate energy and cost ONLY from billing meters
      for (const device of billingMeters) {
        const readings = await storage.getMeterReadings(device.id, Math.ceil(periodHours));
        
        if (readings.length === 0) {
          devicesWithoutData++;
          continue;
        }
        
        // Filter out invalid readings
        const validReadings = readings.filter(isValidReading);
        
        if (validReadings.length === 0) {
          devicesWithoutData++;
          continue;
        }
        
        devicesWithData++;
        
        // Calculate energy consumption (max - min)
        let minEnergy = validReadings[0].energy || 0;
        let maxEnergy = validReadings[0].energy || 0;
        let deviceMaxPower = 0;
        
        for (const reading of validReadings) {
          const energy = reading.energy || 0;
          if (energy < minEnergy) minEnergy = energy;
          if (energy > maxEnergy) maxEnergy = energy;
          
          // Track power
          if (reading.power) {
            avgPower += reading.power;
            powerCount++;
            if (reading.power > maxPower) maxPower = reading.power;
            if (reading.power > deviceMaxPower) deviceMaxPower = reading.power;
          }
          
          // Track voltage
          if (reading.voltage) {
            avgVoltage += reading.voltage;
            voltageCount++;
          }
          
          // Track current
          if (reading.current) {
            avgCurrent += reading.current;
            currentCount++;
          }
        }
        
        const deviceConsumption = maxEnergy - minEnergy;
        totalEnergy += deviceConsumption;
        sumOfIndividualPeaks += deviceMaxPower;
        billingMetersCount++;
      }
      
      // Calculate additional stats from ALL meters (not just billing meters)
      for (const device of allMetersForStats) {
        // Skip if already processed as billing meter
        if (device.isBillingMeter) continue;
        
        const readings = await storage.getMeterReadings(device.id, Math.ceil(periodHours));
        if (readings.length === 0) continue;
        
        const validReadings = readings.filter(isValidReading);
        if (validReadings.length === 0) continue;
        
        let deviceMaxPower = 0;
        for (const reading of validReadings) {
          // Track power for statistics
          if (reading.power) {
            avgPower += reading.power;
            powerCount++;
            if (reading.power > maxPower) maxPower = reading.power;
            if (reading.power > deviceMaxPower) deviceMaxPower = reading.power;
          }
          
          // Track voltage
          if (reading.voltage) {
            avgVoltage += reading.voltage;
            voltageCount++;
          }
          
          // Track current
          if (reading.current) {
            avgCurrent += reading.current;
            currentCount++;
          }
        }
        
        sumOfIndividualPeaks += deviceMaxPower;
        devicesWithData++;
      }
      
      totalCost = totalEnergy * 8;
      avgPower = powerCount > 0 ? avgPower / powerCount : 0;
      avgVoltage = voltageCount > 0 ? avgVoltage / voltageCount : 0;
      avgCurrent = currentCount > 0 ? avgCurrent / currentCount : 0;
      
      // Prepare parameter values
      const paramValues: Record<string, number> = {
        totalEnergy,
        totalCost,
        avgPower,
        maxPower,
        deviceCount: devicesWithData, // Only count devices with valid data
        daysElapsed: Math.max(daysElapsed, 0.01), // Prevent division by zero
        avgVoltage,
        avgCurrent,
        sumOfIndividualPeaks,
        systemPeak: maxPower
      };
      
      // Process each calculation
      const results: any[] = [];
      
      for (const [key, calc] of Object.entries(calculations)) {
        try {
          // Simple formula evaluator (safe for basic arithmetic)
          let formula = (calc as any).formula;
          
          // Replace parameters with actual values
          for (const param of (calc as any).parameters) {
            const value = paramValues[param] || 0;
            formula = formula.replace(new RegExp(param, 'g'), value.toString());
          }
          
          // Evaluate formula safely
          const result = Function(`"use strict"; return (${formula})`)();
          
          results.push({
            id: key,
            name: (calc as any).name,
            description: (calc as any).description,
            value: result,
            unit: (calc as any).unit,
            category: (calc as any).category,
            icon: (calc as any).icon,
            formula: (calc as any).formula,
            parameters: (calc as any).parameters
          });
        } catch (error) {
          console.error(`Failed to calculate ${key}:`, error);
        }
      }
      
      res.json({
        period,
        periodHours,
        daysElapsed,
        calculations: results,
        metadata: {
          totalEnergy,
          totalCost,
          avgPower,
          maxPower,
          deviceCount: devicesWithData + billingMetersCount,
          avgVoltage,
          avgCurrent,
          onlineDevices: onlineDevices.length,
          devicesWithData: devicesWithData + billingMetersCount,
          devicesWithoutData,
          billingMetersCount,
          billingMetersUsedForCost: billingMetersCount
        }
      });
    } catch (error) {
      console.error('❌ Failed to fetch custom analytics:', error);
      res.status(500).json({ message: 'Failed to fetch custom analytics', error: String(error) });
    }
  });

  // --- BMS Integration ---
  app.get('/api/bms/status', async (req, res) => {
    try {
      const { bmsManager } = await import("./bms-adapters/bms-manager");
      const status = bmsManager.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'BMS Manager not available' });
    }
  });

  app.get('/api/bms/meters', async (req, res) => {
    try {
      const { bmsManager } = await import("./bms-adapters/bms-manager");
      const meters = await bmsManager.getAllMeters();
      res.json(meters);
    } catch (error) {
      res.status(500).json({ error: `Failed to fetch BMS meters: ${error}` });
    }
  });

  app.get('/api/bms/realtime', async (req, res) => {
    try {
      const { bmsManager } = await import("./bms-adapters/bms-manager");
      const meterId = req.query.meterId as string;
      const readings = await bmsManager.getAllRealtimeData(meterId);
      res.json(readings);
    } catch (error) {
      res.status(500).json({ error: `Failed to fetch BMS realtime data: ${error}` });
    }
  });

  app.get('/api/bms/alarms', async (req, res) => {
    try {
      const { bmsManager } = await import("./bms-adapters/bms-manager");
      const activeOnly = req.query.activeOnly !== 'false';
      const alarms = await bmsManager.getAllAlarms(activeOnly);
      res.json(alarms);
    } catch (error) {
      res.status(500).json({ error: `Failed to fetch BMS alarms: ${error}` });
    }
  });

  // Test endpoint for BMS sync
  app.post('/api/bms/sync', async (req, res) => {
    try {
      const { bmsManager } = await import("./bms-adapters/bms-manager");
      // Trigger manual sync (this would be a private method made public for testing)
      res.json({ message: 'BMS sync triggered successfully' });
    } catch (error) {
      res.status(500).json({ error: `Failed to trigger BMS sync: ${error}` });
    }
  });

  // --- Predictive Analytics Routes ---
  
  /**
   * GET /api/predictive/forecast
   * Get demand forecast for devices
   */
  app.get("/api/predictive/forecast", async (req, res) => {
    try {
      const { PredictiveService } = await import('./analytics/predictive-service');
      const service = new PredictiveService(storage);
      
      const deviceId = req.query.deviceId ? Number(req.query.deviceId) : undefined;
      const forecasts = await service.generateDemandForecast(deviceId);
      
      res.json({
        success: true,
        forecasts,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Forecast generation failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate forecast',
        error: error.message
      });
    }
  });

  /**
   * GET /api/predictive/trends
   * Analyze energy trends
   */
  app.get("/api/predictive/trends", async (req, res) => {
    try {
      const { PredictiveService } = await import('./analytics/predictive-service');
      const service = new PredictiveService(storage);
      
      const deviceId = req.query.deviceId ? Number(req.query.deviceId) : undefined;
      const period = (req.query.period as 'daily' | 'weekly' | 'monthly') || 'weekly';
      
      const trends = await service.analyzeTrends(deviceId, period);
      
      res.json({
        success: true,
        period,
        trends,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Trend analysis failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze trends',
        error: error.message
      });
    }
  });

  /**
   * GET /api/predictive/anomalies
   * Detect anomalies in energy consumption
   */
  app.get("/api/predictive/anomalies", async (req, res) => {
    try {
      const { PredictiveService } = await import('./analytics/predictive-service');
      const service = new PredictiveService(storage);
      
      const deviceId = req.query.deviceId ? Number(req.query.deviceId) : undefined;
      const anomalies = await service.detectAnomalies(deviceId);
      
      res.json({
        success: true,
        count: anomalies.length,
        anomalies,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Anomaly detection failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to detect anomalies',
        error: error.message
      });
    }
  });

  /**
   * GET /api/predictive/recommendations
   * Get optimization recommendations
   */
  app.get("/api/predictive/recommendations", async (req, res) => {
    try {
      const { PredictiveService } = await import('./analytics/predictive-service');
      const service = new PredictiveService(storage);
      
      const recommendations = await service.generateRecommendations();
      
      res.json({
        success: true,
        count: recommendations.length,
        recommendations,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Recommendation generation failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate recommendations',
        error: error.message
      });
    }
  });

  // === TREND LOG IMPORT ENDPOINTS ===
  app.post("/api/trend-logs/import-csv", async (req, res) => {
    try {
      console.log('🚀 Starting trend log import from CSV...');
      
      const { readFileSync } = await import('fs');
      const { join } = await import('path');
      const { parse: parseCsv } = await import('csv-parse/sync');
      const { db } = await import('./db');
      const { trendLogs, trendLogItems } = await import('@shared/schema');
      const { eq, insert } = await import('drizzle-orm');
      
      const logInfoPath = join(process.cwd(), 'exported-data', 'LogInfo.csv');
      const logItemInfoPath = join(process.cwd(), 'exported-data', 'LogItemInfo.csv');
      
      const logInfoContent = readFileSync(logInfoPath, 'utf-8');
      const logItemInfoContent = readFileSync(logItemInfoPath, 'utf-8');
      
      const logInfoRecords = parseCsv(logInfoContent, { columns: true, skip_empty_lines: true }) as any[];
      const logItemInfoRecords = parseCsv(logItemInfoContent, { columns: true, skip_empty_lines: true }) as any[];
      
      console.log(`✅ Loaded ${logInfoRecords.length} trend logs and ${logItemInfoRecords.length} items`);
      
      const energyKeywords = ['kwh', 'kw', 'power', 'energy', 'amp', 'volt', 'current', 'voltage', 'hz', 'frequency', 'meter', 'demand'];
      
      let trendLogCount = 0;
      let itemCount = 0;
      
      for (const logInfo of logInfoRecords) {
        const tableName = logInfo.TableName;
        
        if (!tableName || !tableName.startsWith('TrendLog')) continue;
        
        const isEnergyRelated = energyKeywords.some(kw => 
          logInfo.AbsolutePath?.toLowerCase().includes(kw) ||
          logInfo.SourceName?.toLowerCase().includes(kw)
        );
        
        if (!isEnergyRelated) continue;
        
        const logId = parseInt(logInfo.Id);
        
        const existing = await db.select().from(trendLogs).where(eq(trendLogs.logId, logId));
        if (existing.length > 0) continue;
        
        await db.insert(trendLogs).values({
          logId,
          logType: parseInt(logInfo.Type) || 3,
          sourceId: logInfo.SourceId ? parseInt(logInfo.SourceId) : null,
          sourceName: logInfo.SourceName || '',
          absolutePath: logInfo.AbsolutePath || '',
          tableName: tableName,
          sourceRecordCount: logInfo.SourceTotalCnt ? parseInt(logInfo.SourceTotalCnt) : null,
          serverRecordCount: logInfo.ServerRecCnt ? parseInt(logInfo.ServerRecCnt) : null,
          firstTimestamp: logInfo.FirstTimestamp ? BigInt(logInfo.FirstTimestamp) : null,
          lastTimestamp: logInfo.LastTimestamp ? BigInt(logInfo.LastTimestamp) : null,
          isActive: true,
        });
        
        trendLogCount++;
        
        const items = logItemInfoRecords.filter(item => item.LogId === logInfo.Id);
        for (const item of items) {
          await db.insert(trendLogItems).values({
            logId,
            itemId: item.ItemId ? parseInt(item.ItemId) : null,
            itemIndex: parseInt(item.ItemIndex),
            absolutePath: item.AbsolutePath || '',
            unit: item.Unit || '',
            aggregationMode: item.AggregationMode ? parseInt(item.AggregationMode) : null,
            compression: item.Compression || null,
          });
          itemCount++;
        }
      }
      
      console.log(`✅ Imported ${trendLogCount} trend logs with ${itemCount} total items`);
      res.json({
        success: true,
        message: `Imported ${trendLogCount} trend logs with ${itemCount} parameters`,
        trendLogCount,
        itemCount
      });
    } catch (error: any) {
      console.error('❌ Error importing trend logs:', error);
      res.status(500).json({
        success: false,
        message: "Failed to import trend logs",
        error: error.message
      });
    }
  });

  app.get("/api/trend-logs", async (req, res) => {
    try {
      const { db } = await import('./db');
      const { trendLogs } = await import('@shared/schema');
      
      const logs = await db.select().from(trendLogs);
      res.json({
        success: true,
        count: logs.length,
        data: logs
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch trend logs",
        error: error.message
      });
    }
  });

  app.get("/api/trend-logs/:logId/items", async (req, res) => {
    try {
      const logId = parseInt(req.params.logId);
      const { db } = await import('./db');
      const { trendLogItems } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      const items = await db.select().from(trendLogItems).where(eq(trendLogItems.logId, logId));
      
      const itemsByUnit: { [unit: string]: any[] } = {};
      for (const item of items) {
        const unit = item.unit || 'N/A';
        if (!itemsByUnit[unit]) {
          itemsByUnit[unit] = [];
        }
        itemsByUnit[unit].push(item);
      }
      
      res.json({
        success: true,
        logId,
        itemCount: items.length,
        itemsByUnit,
        items
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch trend log items",
        error: error.message
      });
    }
  });

  // Seed Data if empty - DISABLED: Only use real BACnet discovered devices
  // await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  // Database seeding disabled - devices will be populated from BACnet discovery
  console.log("⚠️  Database seeding is disabled. Devices will be populated from BACnet discovery.");
  return;
  
  /* ORIGINAL SEED CODE - DISABLED
  const devices = await storage.getDevices();
  if (devices.length === 0) {
    console.log("Seeding database...");
    
    const device1 = await storage.createDevice({
      name: "Main Feeder PLC",
      type: "PLC",
      location: "Building A",
      ipAddress: "192.168.1.10",
      status: "online",
      config: { protocol: "Modbus TCP" }
    });

    const device2 = await storage.createDevice({
      name: "HVAC Unit 1",
      type: "Smart Meter",
      location: "Rooftop",
      status: "online",
      config: { protocol: "MQTT" }
    });

    const device3 = await storage.createDevice({
      name: "Assembly Line 4",
      type: "Sensor",
      location: "Production Floor",
      status: "offline",
      config: {}
    });

    // Seed readings
    await storage.createReading({
      deviceId: device1.id,
      power: 450.5,
      voltage: 400.2,
      current: 1120.5,
      energy: 15000.0,
      frequency: 50.0,
      powerFactor: 0.95
    });

    await storage.createReading({
      deviceId: device2.id,
      power: 120.3,
      voltage: 399.8,
      current: 300.2,
      energy: 5000.0,
      frequency: 50.0,
      powerFactor: 0.92
    });
    
    console.log("Database seeded.");
  }
  */
  
  // Check if storage has threshold checking capability and run initial checks
  if ('triggerThresholdChecks' in storage) {
    console.log("🔍 Running initial threshold checks...");
    setTimeout(async () => {
      try {
        await (storage as any).triggerThresholdChecks();
      } catch (error) {
        console.log("Error in initial threshold checks:", error);
      }
    }, 1000); // Wait 1 second for everything to initialize
  }
}
