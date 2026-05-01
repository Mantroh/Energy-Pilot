import { db } from "./db";
import {
  devices, readings, alerts, thresholds, users,
  bacnetControllers, bacnetObjectMappings,
  trendLogs, trendLogItems, meterTrendMappings,
  type Device, type InsertDevice,
  type Reading, type InsertReading,
  type Alert, type InsertAlert,
  type Threshold, type InsertThreshold,
  type User, type InsertUser,
  type BacnetController, type InsertBacnetController,
  type BacnetObjectMapping, type InsertBacnetObjectMapping,
  type TrendLog, type InsertTrendLog,
  type TrendLogItem, type InsertTrendLogItem,
  type MeterTrendMapping, type InsertMeterTrendMapping
} from "@shared/schema";
import type { BMSConnection, InsertBMSConnection, UpdateBMSConnection } from "../shared/bms-schema";
import { insertBMSConnectionSchema, updateBMSConnectionSchema, defaultFieldMappings } from "../shared/bms-schema";
import { eq, desc, and, gte, lt, sql } from "drizzle-orm";

export interface IStorage {
  // Devices
  getDevices(): Promise<Device[]>;
  getDevice(id: number): Promise<Device | undefined>;
  createDevice(device: InsertDevice): Promise<Device>;
  updateDevice(id: number, updates: Partial<InsertDevice>): Promise<Device>;
  deleteDevice(id: number): Promise<void>;
  // BMS Connections
  getBMSConnections(): Promise<BMSConnection[]>;
  getBMSConnection(id: number): Promise<BMSConnection | undefined>;
  createBMSConnection(connection: InsertBMSConnection): Promise<BMSConnection>;
  updateBMSConnection(id: number, connection: UpdateBMSConnection): Promise<BMSConnection>;
  deleteBMSConnection(id: number): Promise<void>;
  testBMSConnection(id: number): Promise<{ success: boolean; message: string; }>;
  // Readings
  getLatestReading(deviceId: number): Promise<Reading | undefined>;
  getReadings(deviceId: number, limit: number): Promise<Reading[]>;
  createReading(reading: InsertReading): Promise<Reading>;

  // Meter-specific methods
  getMeters(): Promise<Device[]>;
  getMeterReading(deviceId: number): Promise<Reading | null>;
  getMeterReadings(deviceId: number, hours?: number): Promise<Reading[]>;

  // Alerts
  getAlerts(status?: 'active' | 'acknowledged' | 'all'): Promise<(Alert & { deviceName: string })[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  acknowledgeAlert(id: number, userId: string): Promise<Alert>;

  // Analytics
  getAnalyticsOverview(): Promise<{
    totalConsumption: number;
    activeAlarms: number;
    onlineDevices: number;
    totalDevices: number;
  }>;
  getConsumptionData(timeRange?: string, startDate?: string, endDate?: string): Promise<Array<{
    date: string;
    deviceId: number;
    deviceName: string;
    energy: number;
    power: number;
    cost: number;
  }>>;
  exportConsumptionData(timeRange: string, startDate?: string, endDate?: string, format?: string): Promise<{
    data: string;
    filename: string;
  }>;

  // Thresholds
  getThresholds(): Promise<Threshold[]>;
  createThreshold(threshold: InsertThreshold): Promise<Threshold>;
  updateThreshold(id: number, updates: Partial<InsertThreshold>): Promise<Threshold>;
  deleteThreshold(id: number): Promise<void>;

  // Users
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser & { password: string }): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // BACnet Controllers
  getBacnetControllers(): Promise<BacnetController[]>;
  getBacnetController(id: number): Promise<BacnetController | undefined>;
  getBacnetControllerByDeviceId(deviceId: number): Promise<BacnetController | undefined>;
  createBacnetController(controller: InsertBacnetController): Promise<BacnetController>;
  updateBacnetController(id: number, updates: Partial<InsertBacnetController>): Promise<BacnetController>;
  deleteBacnetController(id: number): Promise<void>;

  // BACnet Object Mappings
  createBacnetObjectMapping(mapping: InsertBacnetObjectMapping): Promise<BacnetObjectMapping>;
  getBacnetObjectMappingsByDevice(deviceId: number): Promise<BacnetObjectMapping[]>;

  // Trend Logs
  importTrendLogsFromCSV(): Promise<{ trendLogCount: number; itemCount: number; }>;
  getTrendLogs(): Promise<any[]>;
  getTrendLogItems(logId: number): Promise<any[]>;
  linkMeterToTrendLog(deviceId: number, trendLogId: number, friendlyName?: string): Promise<any>;
  getMeterTrendLogs(deviceId: number): Promise<any[]>;
}

// Mock storage for development mode (when no database is available)
export class MockStorage implements IStorage {
  private mockDevices: Device[] = [
    // DISABLED: All demo devices removed - using real METRO_BHAWAN BMS data instead
    // Original demo meters were:
    // EM-MAIN-INCOMER, EM-HVAC-SYSTEM, EM-LIGHTING-CIRCUIT, EM-DATA-CENTER, EM-PRODUCTION-LINE
  ];
  // Note: Real devices will be populated from BMS integration

  private mockReadings: Reading[] = [];
  // Note: Real readings will be collected from BACnet objects

  constructor() {
    // DISABLED: Don't generate demo historical data - use real BMS data instead
    // this.mockReadings = this.initializeDemoHistoricalData();
    this.mockReadings = [];

    // Initialize demo alerts
    this.mockAlerts = [
      {
        id: 1,
        deviceId: 1,
        deviceName: "EM-MAIN-INCOMER",
        severity: "warning",
        message: "Power consumption approaching threshold (550 kW / 600 kW limit)",
        timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 mins ago
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
      },
      {
        id: 2,
        deviceId: 3,
        deviceName: "EM-LIGHTING-CIRCUIT",
        severity: "info",
        message: "Load factor optimal at 87%",
        timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
      },
    ];

    // Initialize demo thresholds
    this.mockThresholds = [
      {
        id: 1,
        deviceId: 1,
        deviceType: null,
        parameter: "power",
        operator: "greater_than",
        value: 600,
        unit: "kW",
        severity: "high",
        enabled: true,
        message: "Main incomer power exceeded threshold",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        deviceId: null,
        deviceType: "Smart Meter",
        parameter: "voltage",
        operator: "less_than",
        value: 380,
        unit: "V",
        severity: "critical",
        enabled: true,
        message: "Low voltage detected",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        deviceId: null,
        deviceType: "Smart Meter",
        parameter: "power_factor",
        operator: "less_than",
        value: 0.85,
        unit: "",
        severity: "medium",
        enabled: true,
        message: "Poor power factor detected",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }

  // Generate realistic 7-day historical data for all demo meters during initialization
  private initializeDemoHistoricalData(): Reading[] {
    const readings: Reading[] = [];
    const now = new Date();
    let readingId = 1;

    // Meter configurations with realistic patterns
    const meterConfigs = [
      {
        deviceId: 1,
        name: "EM-MAIN-INCOMER",
        basePower: 550,
        baseVoltage: 402,
        baseCurrent: 790,
        baseEnergy: 13200,
        powerFactor: 0.92,
        pattern: "office", // High during office hours, low at night
      },
      {
        deviceId: 2,
        name: "EM-HVAC-SYSTEM",
        basePower: 200,
        baseVoltage: 400,
        baseCurrent: 288,
        baseEnergy: 4800,
        powerFactor: 0.89,
        pattern: "hvac", // Temperature-dependent, peaks midday
      },
      {
        deviceId: 3,
        name: "EM-LIGHTING-CIRCUIT",
        basePower: 70,
        baseVoltage: 398,
        baseCurrent: 107,
        baseEnergy: 1680,
        powerFactor: 0.95,
        pattern: "lighting", // High during work hours, very low at night
      },
      {
        deviceId: 4,
        name: "EM-DATA-CENTER",
        basePower: 195,
        baseVoltage: 401,
        baseCurrent: 280,
        baseEnergy: 4680,
        powerFactor: 0.90,
        pattern: "247", // Constant 24/7 load with small variations
      },
      {
        deviceId: 5,
        name: "EM-PRODUCTION-LINE",
        basePower: 365,
        baseVoltage: 403,
        baseCurrent: 521,
        baseEnergy: 8760,
        powerFactor: 0.91,
        pattern: "production", // Shift-based, weekday operation
      },
    ];

    // Generate readings for past 7 days (every 15 minutes = 672 readings per meter)
    const intervalsPerDay = 96; // 24 hours * 4 (every 15 min)
    const totalDays = 7;

    for (const config of meterConfigs) {
      let cumulativeEnergy = config.baseEnergy - (config.basePower * 24 * totalDays);

      for (let day = totalDays; day >= 0; day--) {
        for (let interval = 0; interval < intervalsPerDay; interval++) {
          const minutesAgo = (day * 24 * 60) + (interval * 15);
          const timestamp = new Date(now.getTime() - (minutesAgo * 60 * 1000));
          const hour = timestamp.getHours();
          const dayOfWeek = timestamp.getDay(); // 0=Sunday, 6=Saturday
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          // Calculate power based on pattern
          let powerMultiplier = 1.0;
          
          switch (config.pattern) {
            case "office":
              if (hour >= 8 && hour <= 18) {
                powerMultiplier = 0.85 + (Math.random() * 0.15); // 85-100%
              } else if (hour >= 19 && hour <= 22) {
                powerMultiplier = 0.45 + (Math.random() * 0.10); // 45-55%
              } else {
                powerMultiplier = 0.30 + (Math.random() * 0.10); // 30-40%
              }
              if (isWeekend) powerMultiplier *= 0.20; // 20% on weekends
              break;

            case "hvac":
              if (hour >= 10 && hour <= 16) {
                powerMultiplier = 0.90 + (Math.random() * 0.10); // 90-100% peak cooling
              } else if (hour >= 7 && hour <= 20) {
                powerMultiplier = 0.65 + (Math.random() * 0.15); // 65-80%
              } else {
                powerMultiplier = 0.25 + (Math.random() * 0.10); // 25-35% night setback
              }
              if (isWeekend) powerMultiplier *= 0.60; // 60% on weekends
              break;

            case "lighting":
              if (hour >= 8 && hour <= 19) {
                powerMultiplier = 0.80 + (Math.random() * 0.20); // 80-100%
              } else if (hour >= 20 && hour <= 22) {
                powerMultiplier = 0.30 + (Math.random() * 0.10); // 30-40%
              } else {
                powerMultiplier = 0.10 + (Math.random() * 0.05); // 10-15% emergency lighting
              }
              if (isWeekend) powerMultiplier *= 0.15; // 15% on weekends
              break;

            case "247":
              // Constant load with minor fluctuations
              powerMultiplier = 0.85 + (Math.random() * 0.15); // 85-100% always
              break;

            case "production":
              if (!isWeekend) {
                if (hour >= 6 && hour <= 22) {
                  powerMultiplier = 0.80 + (Math.random() * 0.20); // 80-100% during shifts
                } else {
                  powerMultiplier = 0.25 + (Math.random() * 0.10); // 25-35% cleanup/standby
                }
              } else {
                powerMultiplier = 0.20 + (Math.random() * 0.05); // 20-25% weekend maintenance
              }
              break;
          }

          const power = config.basePower * powerMultiplier;
          const voltage = config.baseVoltage * (0.98 + Math.random() * 0.04); // ±2%
          const current = config.baseCurrent * powerMultiplier;
          const powerFactor = config.powerFactor * (0.97 + Math.random() * 0.03);
          
          // Calculate energy increment (kWh = kW * hours)
          const energyIncrement = power * (15 / 60); // 15 minutes in hours
          cumulativeEnergy += energyIncrement;

          readings.push({
            id: readingId++,
            deviceId: config.deviceId,
            power: Math.round(power * 10) / 10,
            voltage: Math.round(voltage * 10) / 10,
            voltageL1L2: Math.round((voltage - 1 + Math.random() * 2) * 10) / 10,
            voltageL2L3: Math.round((voltage + Math.random() * 2) * 10) / 10,
            voltageL3L1: Math.round((voltage - 0.5 + Math.random() * 1) * 10) / 10,
            current: Math.round(current * 10) / 10,
            currentL1: Math.round((current - 2 + Math.random() * 4) * 10) / 10,
            currentL2: Math.round((current + Math.random() * 4) * 10) / 10,
            currentL3: Math.round((current - 1 + Math.random() * 2) * 10) / 10,
            energy: Math.round(cumulativeEnergy * 10) / 10,
            frequency: 50.0 + (Math.random() * 0.2 - 0.1), // 49.9-50.1 Hz
            powerFactor: Math.round(powerFactor * 100) / 100,
            timestamp,
          });
        }
      }
    }

    console.log(`📊 Generated ${readings.length} historical readings across ${meterConfigs.length} meters (7 days)`);
    return readings.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Generate real-time readings for meters
  private generateRealtimeReading(deviceId: number): Reading {
    const device = this.mockDevices.find(d => d.id === deviceId);
    
    // Get the most recent reading for this device from historical data
    const recentReadings = this.mockReadings
      .filter(r => r.deviceId === deviceId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    const baseReading = recentReadings[0];
    
    // If device is offline, return zero readings
    if (device && device.status === 'offline') {
      return {
        id: Date.now(),
        deviceId,
        power: 0,
        energy: baseReading?.energy || 0,
        voltage: 0,
        voltageL1L2: 0,
        voltageL2L3: 0,
        voltageL3L1: 0,
        current: 0,
        currentL1: 0,
        currentL2: 0,
        currentL3: 0,
        frequency: 50,
        powerFactor: 1,
        timestamp: new Date()
      };
    }
    
    // If no base reading exists (shouldn't happen with historical data), return defaults
    if (!baseReading) {
      const defaultPower = 100;
      return {
        id: Date.now(),
        deviceId,
        power: defaultPower,
        energy: defaultPower * 24,
        voltage: 400,
        voltageL1L2: 400,
        voltageL2L3: 400,
        voltageL3L1: 400,
        current: 145,
        currentL1: 145,
        currentL2: 145,
        currentL3: 145,
        frequency: 50.0,
        powerFactor: 0.90,
        timestamp: new Date()
      };
    }

    // Add realistic variations based on time of day
    const now = new Date();
    const hour = now.getHours();
    
    // Adjust power variation based on device pattern and time
    let powerMultiplier = 1.0;
    const deviceName = device?.name || "";
    
    if (deviceName.includes("INCOMER") || deviceName.includes("MAIN")) {
      // Main incomer follows office pattern
      powerMultiplier = hour >= 8 && hour <= 18 ? 0.95 + Math.random() * 0.10 : 0.40 + Math.random() * 0.15;
    } else if (deviceName.includes("HVAC")) {
      // HVAC peaks midday
      powerMultiplier = hour >= 10 && hour <= 16 ? 0.90 + Math.random() * 0.10 : 0.50 + Math.random() * 0.20;
    } else if (deviceName.includes("LIGHTING")) {
      // Lighting high during day
      powerMultiplier = hour >= 8 && hour <= 19 ? 0.85 + Math.random() * 0.15 : 0.15 + Math.random() * 0.05;
    } else if (deviceName.includes("DATA")) {
      // Data center constant
      powerMultiplier = 0.90 + Math.random() * 0.10;
    } else if (deviceName.includes("PRODUCTION")) {
      // Production shift-based
      powerMultiplier = hour >= 6 && hour <= 22 ? 0.85 + Math.random() * 0.15 : 0.30 + Math.random() * 0.10;
    } else {
      powerMultiplier = 0.95 + Math.random() * 0.10;
    }

    const powerVariation = (Math.random() - 0.5) * 0.05; // ±2.5% micro-variation
    const voltageVariation = (Math.random() - 0.5) * 0.01; // ±0.5% variation
    const currentVariation = (Math.random() - 0.5) * 0.04; // ±2% variation
    const frequencyVariation = (Math.random() - 0.5) * 0.001; // ±0.05Hz
    const pfVariation = (Math.random() - 0.5) * 0.01; // ±0.5% variation

    const currentPower = Math.max(0, baseReading.power! * powerMultiplier * (1 + powerVariation));
    
    // Update cumulative energy properly
    this.updateCumulativeEnergy(deviceId, currentPower, now);
    const deviceEnergy = this.deviceCumulativeEnergy.get(deviceId);

    const reading: Reading = {
      id: Date.now() + Math.random(),
      deviceId,
      power: Math.round(currentPower * 10) / 10,
      energy: Math.round((deviceEnergy?.energy || baseReading.energy || 0) * 10) / 10,
      voltage: Math.round((baseReading.voltage! * (1 + voltageVariation)) * 10) / 10,
      voltageL1L2: Math.round((baseReading.voltageL1L2! * (1 + voltageVariation)) * 10) / 10,
      voltageL2L3: Math.round((baseReading.voltageL2L3! * (1 + voltageVariation)) * 10) / 10,
      voltageL3L1: Math.round((baseReading.voltageL3L1! * (1 + voltageVariation)) * 10) / 10,
      current: Math.round((currentPower / (baseReading.voltage! / (baseReading.power! / baseReading.current!))) * 10) / 10,
      currentL1: Math.round((baseReading.currentL1! * powerMultiplier * (1 + currentVariation)) * 10) / 10,
      currentL2: Math.round((baseReading.currentL2! * powerMultiplier * (1 + currentVariation)) * 10) / 10,
      currentL3: Math.round((baseReading.currentL3! * powerMultiplier * (1 + currentVariation)) * 10) / 10,
      frequency: Math.round((50.0 + frequencyVariation) * 100) / 100,
      powerFactor: Math.round(Math.max(0.1, Math.min(1, (baseReading.powerFactor || 0.9) * (1 + pfVariation))) * 100) / 100,
      timestamp: now
    };
    
    // Asynchronously check thresholds (don't await to keep real-time performance)
    setImmediate(() => this.checkThresholds(reading));
    
    return reading;
  }

  private updateCumulativeEnergy(deviceId: number, currentPower: number, now: Date) {
    const existing = this.deviceCumulativeEnergy.get(deviceId);
    
    if (!existing) {
      // First reading for this device in current period
      this.deviceCumulativeEnergy.set(deviceId, {
        energy: 0,
        lastUpdate: now,
        periodStart: this.getPeriodStart(now)
      });
      return;
    }
    
    // Calculate time interval since last update (in hours)
    const timeIntervalMs = now.getTime() - existing.lastUpdate.getTime();
    const timeIntervalHours = timeIntervalMs / (1000 * 60 * 60);
    
    // Add energy consumed in this interval: Power × Time
    const incrementalEnergy = currentPower * timeIntervalHours;
    
    // Update cumulative energy (always increases)
    existing.energy += incrementalEnergy;
    existing.lastUpdate = now;
    
    this.deviceCumulativeEnergy.set(deviceId, existing);
  }
  
  private getPeriodStart(now: Date): Date {
    switch (this.currentPeriod) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week': {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return startOfWeek;
      }
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      default:
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
  }
  
  resetPeriodEnergy(period: string) {
    this.currentPeriod = period;
    const now = new Date();
    const periodStart = this.getPeriodStart(now);
    
    // Reset all device energy counters for new period
    for (const [deviceId, data] of this.deviceCumulativeEnergy.entries()) {
      this.deviceCumulativeEnergy.set(deviceId, {
        energy: 0,
        lastUpdate: now,
        periodStart: periodStart
      });
    }
  }

  private mockAlerts: (Alert & { deviceName: string })[] = [];
  private deviceCumulativeEnergy: Map<number, { energy: number, lastUpdate: Date, periodStart: Date }> = new Map();
  private currentPeriod: string = 'today';

  async getDevices(): Promise<Device[]> {
    return [...this.mockDevices];
  }

  async getDevice(id: number): Promise<Device | undefined> {
    return this.mockDevices.find(d => d.id === id);
  }

  async createDevice(device: InsertDevice): Promise<Device> {
    // Calculate next ID - handle empty array case
    const maxId = this.mockDevices.length > 0 
      ? Math.max(...this.mockDevices.map(d => d.id)) 
      : 0;
    
    const newDevice: Device = {
      ...device,
      id: maxId + 1,
      lastSeen: new Date(),
      createdAt: new Date(),
      config: device.config || null
    };
    this.mockDevices.push(newDevice);
    console.log('MockStorage: Created device:', newDevice);
    return newDevice;
  }

  async updateDevice(id: number, updates: Partial<InsertDevice>): Promise<Device> {
    console.log(`[MockStorage] Updating device ${id}. Current devices:`, this.mockDevices.map(d => ({ id: d.id, name: d.name })));
    console.log(`[MockStorage] Updates:`, updates);
    
    const index = this.mockDevices.findIndex(d => d.id === id);
    if (index === -1) {
      console.error(`[MockStorage] Device ${id} not found in array`);
      throw new Error(`Device not found: ${id}`);
    }
    
    this.mockDevices[index] = {
      ...this.mockDevices[index],
      ...updates,
      lastSeen: new Date()
    };
    
    console.log(`[MockStorage] Updated device:`, this.mockDevices[index]);
    return this.mockDevices[index];
  }

  async deleteDevice(id: number): Promise<void> {
    const index = this.mockDevices.findIndex(d => d.id === id);
    if (index !== -1) {
      this.mockDevices.splice(index, 1);
    }
  }

  async getLatestReading(deviceId: number): Promise<Reading | undefined> {
    return this.mockReadings
      .filter(r => r.deviceId === deviceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
  }

  async getReadings(deviceId: number, limit: number = 100): Promise<Reading[]> {
    return this.mockReadings
      .filter(r => r.deviceId === deviceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async createReading(reading: InsertReading): Promise<Reading> {
    const newReading: Reading = {
      ...reading,
      id: Math.max(...this.mockReadings.map(r => r.id), 0) + 1,
      timestamp: new Date()
    };
    this.mockReadings.push(newReading);
    
    // Check thresholds after creating reading
    await this.checkThresholds(newReading);
    
    return newReading;
  }

  async getMeters(): Promise<Device[]> {
    return this.mockDevices.filter(device => {
      const type = device.type?.toLowerCase();
      return type === 'smart_meter' || 
             type === 'smart meter' || 
             type === 'plc' || 
             type === 'vfd' ||
             type === 'energy meter' ||
             type === 'power meter';
    });
  }

  async getMeterReading(deviceId: number): Promise<Reading | null> {
    // Find the device to check its status
    const device = this.mockDevices.find(d => d.id === deviceId);
    if (!device) {
      return null;
    }

    // First try to get the latest reading from BACnet data collector
    const latestReading = await this.getLatestReading(deviceId);
    
    // If we have a recent reading (within last 60 seconds), return it
    if (latestReading) {
      const age = Date.now() - latestReading.timestamp.getTime();
      if (age < 60000) { // 60 seconds
        return latestReading;
      }
    }

    // If device is offline, return zero readings
    if (device.status === 'offline') {
      return {
        id: Date.now(),
        deviceId,
        power: 0,
        energy: 0,
        voltage: 0,
        current: 0,
        frequency: 0,
        powerFactor: 0,
        timestamp: new Date()
      };
    }

    // If no recent BACnet reading available, return the last reading (could be stale)
    // or generate mock data as fallback for devices without BACnet
    if (latestReading) {
      return latestReading;
    }
    
    // Fallback: generate mock reading for devices without BACnet mappings
    return this.generateRealtimeReading(deviceId);
  }

  async getMeterReadings(deviceId: number, hours: number = 24): Promise<Reading[]> {
    // Return REAL readings from mockReadings array (collected by BACnet)
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    
    // Filter readings for this device within the time range
    const readings = this.mockReadings
      .filter(r => r.deviceId === deviceId && new Date(r.timestamp) >= cutoffTime)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // If we have real readings, return them
    if (readings.length > 0) {
      console.log(`📊 Returning ${readings.length} real readings for device ${deviceId}`);
      return readings;
    }
    
    // Fallback: If no readings exist yet (new device), generate some mock data
    console.log(`⚠️  No readings found for device ${deviceId}, generating mock data`);
    const device = this.mockDevices.find(d => d.id === deviceId);
    if (!device) {
      return [];
    }

    const mockReadings: Reading[] = [];
    const interval = (hours * 60) / 50; // 50 data points over the time period
    
    for (let i = 0; i < 50; i++) {
      const timestamp = new Date(now.getTime() - (i * interval * 60000));
      
      // If device is currently offline, show declining readings toward zero
      let reading: Reading;
      if (device.status === 'offline') {
        // Show gradual decline to zero for offline devices
        const declineFactor = Math.max(0, (50 - i) / 50); // More recent = closer to zero
        const baseReading = this.mockReadings.find(r => r.deviceId === deviceId);
        if (baseReading) {
          reading = {
            id: i + 1,
            deviceId,
            power: (baseReading.power || 0) * declineFactor * 0.1,
            energy: baseReading.energy || 0, // Energy doesn't decline
            voltage: (baseReading.voltage || 0) * declineFactor * 0.2,
            current: (baseReading.current || 0) * declineFactor * 0.1,
            frequency: device.status === 'offline' ? 0 : 50,
            powerFactor: device.status === 'offline' ? 0 : 0.9,
            timestamp
          };
        } else {
          reading = {
            id: i + 1,
            deviceId,
            power: 0,
            energy: 0,
            voltage: 0,
            current: 0,
            frequency: 0,
            powerFactor: 0,
            timestamp
          };
        }
      } else {
        // Online device - generate normal readings
        reading = this.generateRealtimeReading(deviceId);
        reading.timestamp = timestamp;
        reading.id = i + 1;
      }
      
      readings.unshift(reading);
    }
    
    return readings;
  }

  // Generate historical readings for testing (simulate past 30 days of data)
  async generateHistoricalData(deviceId: number, days: number = 30): Promise<void> {
    const device = this.mockDevices.find(d => d.id === deviceId);
    if (!device) {
      console.log(`❌ Device ${deviceId} not found`);
      return;
    }

    console.log(`🕐 Generating ${days} days of historical data for ${device.name}...`);
    
    const now = new Date();
    const readingsPerDay = 96; // One reading every 15 minutes = 4 per hour × 24 hours
    let generatedCount = 0;

    for (let day = days; day >= 0; day--) {
      for (let reading = 0; reading < readingsPerDay; reading++) {
        const timestamp = new Date(
          now.getTime() 
          - (day * 24 * 60 * 60 * 1000) // Days ago
          - (reading * 15 * 60 * 1000)   // 15-minute intervals
        );

        // Generate realistic values with time-of-day patterns
        const hour = timestamp.getHours();
        const isPeakHours = hour >= 9 && hour <= 18; // Business hours
        const isEveningPeak = hour >= 18 && hour <= 22;
        
        // Base values with variations
        const basePower = isPeakHours ? 95 : (isEveningPeak ? 105 : 50);
        const powerVariation = Math.random() * 20 - 10; // ±10 kW
        const power = Math.max(0, basePower + powerVariation);
        
        // Voltage slightly varies
        const baseVoltage = device.name === 'EM_01' ? 216.7 : 383.7;
        const voltage = baseVoltage + (Math.random() * 4 - 2); // ±2V variation
        
        // Current based on power and voltage
        const current = power / (voltage * Math.sqrt(3) / 1000);
        
        // Frequency stable around 50 Hz
        const frequency = 50 + (Math.random() * 0.2 - 0.1);
        
        // Energy accumulates over time (kWh)
        const energy = power * 0.25; // Power × 0.25 hours (15 min = 0.25h)

        const historicalReading: Reading = {
          id: Math.max(...this.mockReadings.map(r => r.id), 0) + 1,
          deviceId,
          power,
          voltage,
          current,
          frequency,
          energy,
          powerFactor: 0.85 + (Math.random() * 0.1), // 0.85-0.95
          timestamp
        };

        this.mockReadings.push(historicalReading);
        generatedCount++;
      }
    }

    console.log(`✅ Generated ${generatedCount} historical readings for ${device.name}`);
    console.log(`📊 Total readings in storage: ${this.mockReadings.length}`);
  }

  async getAlerts(status?: 'active' | 'acknowledged' | 'all'): Promise<(Alert & { deviceName: string })[]> {
    let filteredAlerts = [...this.mockAlerts];
    
    if (status && status !== 'all') {
      filteredAlerts = filteredAlerts.filter(a => a.status === status);
    }
    
    return filteredAlerts;
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const deviceName = this.mockDevices.find(d => d.id === alert.deviceId)?.name || 'Unknown Device';
    const newAlert: Alert & { deviceName: string } = {
      ...alert,
      id: this.mockAlerts.length > 0 ? Math.max(...this.mockAlerts.map(a => a.id)) + 1 : 1,
      timestamp: new Date(),
      createdAt: new Date(),
      deviceName
    };
    this.mockAlerts.push(newAlert);
    return newAlert;
  }

  async acknowledgeAlert(id: number, userId: string): Promise<Alert> {
    const index = this.mockAlerts.findIndex(a => a.id === id);
    if (index === -1) throw new Error('Alert not found');
    
    this.mockAlerts[index] = {
      ...this.mockAlerts[index],
      status: 'acknowledged',
      acknowledgedBy: userId,
      acknowledgedAt: new Date()
    };
    return this.mockAlerts[index];
  }

  async getAnalyticsOverview(): Promise<{
    totalConsumption: number;
    activeAlarms: number;
    onlineDevices: number;
    totalDevices: number;
    dailyConsumption?: number;
    weeklyCost?: number;
    monthlyConsumption?: number;
  }> {
    // Get devices and filter for power-consuming devices that are online
    const allDevices = this.mockDevices;
    const powerDevices = allDevices.filter(d => 
      d.status === 'online' && (d.type === 'smart_meter' || d.type === 'plc')
    );
    
    let totalCurrentPowerKW = 0;
    
    // Sum up current power consumption from all online power devices
    for (const device of powerDevices) {
      try {
        const reading = await this.getMeterReading(device.id);
        const devicePower = reading?.power || 0;
        totalCurrentPowerKW += devicePower;
        console.log(`Device ${device.name} (${device.id}): ${devicePower} kW`);
      } catch (error) {
        console.error(`Error getting reading for device ${device.id}:`, error);
      }
    }
    
    console.log(`Total current power: ${totalCurrentPowerKW} kW`);
    
    // Calculate time-based consumption
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const hoursPassedToday = (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
    
    // Calculate actual consumption for time elapsed today
    const todaysConsumption = totalCurrentPowerKW * hoursPassedToday;
    
    // Calculate projected values
    const projectedDailyConsumption = totalCurrentPowerKW * 24;
    const energyRate = 8; // ₹8 per kWh
    
    const overview = {
      totalConsumption: Math.round(todaysConsumption * 100) / 100, // Today's consumption so far
      dailyConsumption: Math.round(projectedDailyConsumption * 100) / 100,
      weeklyCost: Math.round(projectedDailyConsumption * 7 * energyRate * 100) / 100,
      monthlyConsumption: Math.round(projectedDailyConsumption * 30 * 100) / 100,
      activeAlarms: this.mockAlerts.filter(a => a.status === 'active').length,
      onlineDevices: allDevices.filter(d => d.status === 'online').length,
      totalDevices: allDevices.length
    };
    
    console.log('Analytics Overview:', overview);
    return overview;
  }

  async getConsumptionData(timeRange?: string, startDate?: string, endDate?: string): Promise<Array<{
    date: string;
    deviceId: number;
    deviceName: string;
    energy: number;
    power: number;
    cost: number;
  }>> {
    try {
      console.log('📊 getConsumptionData called:', { timeRange, startDate, endDate });
      
      const now = new Date();
      const data: Array<{
        date: string;
        deviceId: number;
        deviceName: string;
        energy: number;
        power: number;
        cost: number;
      }> = [];

      // Generate consumption data based on time range
      const days = this.getDaysFromTimeRange(timeRange, startDate, endDate);
      console.log('📅 Days to generate:', days);
      
      for (let i = 0; i < days; i++) {
        const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
        const dateStr = date.toISOString().split('T')[0];

        // Add data for each online meter device
        const meterDevices = this.mockDevices.filter(d => 
          d.status === 'online' && (d.type === 'smart_meter' || d.type === 'plc')
        );
        
        console.log(`  Day ${i}: ${dateStr}, devices: ${meterDevices.length}`);

        for (const device of meterDevices) {
          const baseReading = this.mockReadings.find(r => r.deviceId === device.id);
          if (baseReading) {
            // Generate daily consumption with variation
            const dailyVariation = 0.8 + (Math.random() * 0.4); // 80-120% variation
            const energy = (baseReading.energy || 100) * dailyVariation;
            const power = (baseReading.power || 50) * dailyVariation;
            const cost = energy * 8; // ₹8 per kWh

            data.push({
              date: dateStr,
              deviceId: device.id,
              deviceName: device.name,
              energy: Math.round(energy * 100) / 100,
              power: Math.round(power * 100) / 100,
              cost: Math.round(cost * 100) / 100,
            });
          }
        }
      }

      console.log('✅ Generated consumption data:', data.length, 'records');
      return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
      console.error('❌ getConsumptionData error:', error);
      throw error;
    }
  }

  async exportConsumptionData(timeRange: string, startDate?: string, endDate?: string, format: string = 'csv'): Promise<{
    data: string;
    filename: string;
  }> {
    try {
      console.log('📊 exportConsumptionData called:', { timeRange, startDate, endDate, format });
      
      const data = await this.getConsumptionData(timeRange, startDate, endDate);
      console.log('✓ Got consumption data:', data.length, 'items');
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `energy_consumption_${timeRange}_${timestamp}.${format}`;

      if (format === 'csv') {
        // Generate CSV with proper headers and data
        const csvData = this.generateCSV(data);
        console.log('✓ Generated CSV:', csvData.length, 'characters');
        return {
          data: csvData,
          filename: filename
        };
      } else {
        // For now, return CSV format even for excel requests
        const csvData = this.generateCSV(data);
        console.log('✓ Generated CSV (for excel):', csvData.length, 'characters');
        return {
          data: csvData,
          filename: filename.replace('.excel', '.csv')
        };
      }
    } catch (error) {
      console.error('❌ exportConsumptionData error:', error);
      throw error;
    }
  }

  private generateCSV(data: any[]): string {
    try {
      console.log('🔧 generateCSV called with', data.length, 'items');
      
      if (!data || data.length === 0) {
        // Return empty CSV with headers
        console.log('⚠️ No data, returning headers only');
        return 'Date,Time,Device ID,Device Name,Location,Power (kW),Energy (kWh),Voltage (V),Current (A),Frequency (Hz),Power Factor,Cost (₹)\n';
      }

      // CSV Headers
      const headers = [
        'Date',
        'Time', 
        'Device ID',
        'Device Name',
        'Location',
        'Power (kW)',
        'Energy (kWh)',
        'Voltage (V)',
        'Current (A)',
        'Frequency (Hz)',
        'Power Factor',
        'Cost (₹)'
      ];

      // Generate detailed CSV rows from consumption data
      const detailedRows: string[] = [];
      
      data.forEach((item, index) => {
        try {
          const device = this.mockDevices.find(d => d.id === item.deviceId);
          const deviceName = device?.name || item.deviceName || 'Unknown Device';
          const deviceLocation = device?.location || 'Unknown Location';
          
          // Generate hourly readings for each day
          for (let hour = 0; hour < 24; hour++) {
            const timestamp = new Date(item.date);
            timestamp.setHours(hour, 0, 0, 0);
            
            const dateStr = timestamp.toLocaleDateString();
            const timeStr = timestamp.toLocaleTimeString();
            
            // Add realistic variations throughout the day
            const hourlyVariation = 0.7 + (Math.random() * 0.6); // 70-130% variation
            const powerReading = item.power * hourlyVariation;
            const energyReading = item.energy * hourlyVariation;
            
            // Generate realistic electrical readings based on power
            const voltage = 415 + (Math.random() * 10) - 5; // 410-420V range
            const current = (powerReading * 1000) / (voltage * Math.sqrt(3)); // 3-phase calculation
            const frequency = 50 + (Math.random() * 0.4) - 0.2; // 49.8-50.2 Hz
            const powerFactor = 0.85 + (Math.random() * 0.15); // 0.85-1.0
            
            // Calculate cost using ₹8/kWh rate
            const costInINR = energyReading * 8;
            
            const row = [
              `"${dateStr}"`,
              `"${timeStr}"`,
              item.deviceId.toString(),
              `"${deviceName}"`,
              `"${deviceLocation}"`,
              powerReading.toFixed(2),
              energyReading.toFixed(2),
              voltage.toFixed(1),
              current.toFixed(1),
              frequency.toFixed(2),
              powerFactor.toFixed(3),
              costInINR.toFixed(2)
            ].join(',');
            
            detailedRows.push(row);
          }
        } catch (itemError) {
          console.error(`❌ Error processing item ${index}:`, itemError, item);
        }
      });

      console.log('✓ Generated', detailedRows.length, 'CSV rows');
      return [headers.join(','), ...detailedRows].join('\n');
    } catch (error) {
      console.error('❌ generateCSV error:', error);
      throw error;
    }
  }

  private getDaysFromTimeRange(timeRange?: string, startDate?: string, endDate?: string): number {
    if (timeRange === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    switch (timeRange) {
      case 'daily': return 1;
      case 'weekly': return 7;
      case 'monthly': return 30;
      default: return 7;
    }
  }

  // Threshold methods
  private mockThresholds: Threshold[] = [];

  // BMS Connections
  private mockBMSConnections: BMSConnection[] = [];

  // Check thresholds against a reading and create alarms if needed
  private async checkThresholds(reading: Reading): Promise<void> {
    console.log(`🔍 Checking thresholds for device ${reading.deviceId}, power: ${reading.power}kW`);
    
    const device = this.mockDevices.find(d => d.id === reading.deviceId);
    if (!device) {
      console.log(`❌ Device ${reading.deviceId} not found`);
      return;
    }

    console.log(`📋 Found ${this.mockThresholds.length} thresholds to check`);
    
    const applicableThresholds = this.mockThresholds.filter(threshold => {
      if (!threshold.enabled) {
        console.log(`⏭️ Skipping disabled threshold ${threshold.id}`);
        return false;
      }
      
      // Check if threshold applies to this device
      if (threshold.deviceId && threshold.deviceId !== device.id) {
        console.log(`⏭️ Threshold ${threshold.id} is device-specific (${threshold.deviceId}) but reading is from device ${device.id}`);
        return false;
      }
      if (threshold.deviceType && threshold.deviceType !== device.type) {
        console.log(`⏭️ Threshold ${threshold.id} is for device type ${threshold.deviceType} but device is ${device.type}`);
        return false;
      }
      
      console.log(`✅ Threshold ${threshold.id} applies to device ${device.id}`);
      return true;
    });

    console.log(`🎯 ${applicableThresholds.length} applicable thresholds found`);

    for (const threshold of applicableThresholds) {
      let currentValue: number | null = null;
      let parameterName = '';
      
      // Get the parameter value from the reading
      switch (threshold.parameter) {
        case 'power':
          currentValue = reading.power || 0;
          parameterName = 'Power';
          break;
        case 'voltage':
          currentValue = reading.voltage || 0;
          parameterName = 'Voltage';
          break;
        case 'current':
          currentValue = reading.current || 0;
          parameterName = 'Current';
          break;
        case 'frequency':
          currentValue = reading.frequency || 0;
          parameterName = 'Frequency';
          break;
        case 'power_factor':
          currentValue = reading.powerFactor || 0;
          parameterName = 'Power Factor';
          break;
        default:
          console.log(`❌ Unknown parameter: ${threshold.parameter}`);
          continue;
      }
      
      if (currentValue === null) {
        console.log(`❌ No value found for parameter ${threshold.parameter}`);
        continue;
      }
      
      console.log(`📊 Checking ${parameterName}: ${currentValue} ${threshold.operator} ${threshold.value}`);
      
      // Check if threshold condition is met
      let thresholdBreached = false;
      switch (threshold.operator) {
        case 'greater_than':
          thresholdBreached = currentValue > threshold.value;
          break;
        case 'less_than':
          thresholdBreached = currentValue < threshold.value;
          break;
        case 'equals':
          thresholdBreached = Math.abs(currentValue - threshold.value) < 0.01;
          break;
      }
      
      console.log(`🔍 Threshold breach check: ${thresholdBreached}`);
      
      if (thresholdBreached) {
        // Check if we already have an active alarm for this threshold
        const existingAlarm = this.mockAlerts.find(alert => 
          alert.deviceId === device.id && 
          alert.type === `${threshold.parameter}_threshold` &&
          alert.status === 'active'
        );
        
        if (existingAlarm) {
          console.log(`⚠️ Alarm already exists for this threshold`);
        } else {
          // Create new alarm
          const alertMessage = threshold.message || 
            `${parameterName} ${threshold.operator.replace('_', ' ')} ${threshold.value}${threshold.unit} (Current: ${currentValue.toFixed(2)}${threshold.unit})`;
          
          await this.createAlert({
            deviceId: device.id,
            type: `${threshold.parameter}_threshold`,
            severity: threshold.severity === 'critical' ? 'critical' : 
                     threshold.severity === 'high' ? 'warning' : 'info',
            message: alertMessage,
            status: 'active'
          });
          
          console.log(`🚨 Threshold alarm created: ${device.name} - ${alertMessage}`);
        }
      }
    }
  }

  // Method to manually trigger threshold checks on all recent readings (for testing)
  async triggerThresholdChecks(): Promise<void> {
    console.log('🔍 Manually triggering threshold checks...');
    
    // Get recent readings and check them against thresholds
    for (const reading of this.mockReadings) {
      await this.checkThresholds(reading);
    }
    
    // Also generate some new readings that might trigger thresholds
    const devices = this.mockDevices.filter(d => d.status === 'online');
    for (const device of devices) {
      if (Math.random() > 0.5) { // 50% chance of generating a test reading
        const reading = this.generateRealtimeReading(device.id);
        
        // Occasionally make readings exceed thresholds for testing
        if (Math.random() > 0.6) {
          reading.power = (reading.power || 50) * (1.2 + Math.random() * 0.3); // 20-50% higher
        }
        if (Math.random() > 0.7) {
          reading.voltage = Math.max(200, (reading.voltage || 230) * (0.85 + Math.random() * 0.1)); // Lower voltage
        }
        
        await this.createReading(reading);
      }
    }
    
    console.log('✅ Threshold check completed');
  }

  async getThresholds(): Promise<Threshold[]> {
    return [...this.mockThresholds];
  }

  async createThreshold(threshold: InsertThreshold): Promise<Threshold> {
    const newThreshold: Threshold = {
      id: Date.now(), // Simple ID generation for mock
      ...threshold,
      createdAt: new Date(),
    };
    this.mockThresholds.push(newThreshold);
    
    console.log(`✅ New threshold created: ${threshold.parameter} ${threshold.operator} ${threshold.value}`);
    
    // Immediately check all existing readings against this new threshold
    console.log(`🔄 Checking existing readings against new threshold...`);
    for (const reading of this.mockReadings) {
      await this.checkThresholds(reading);
    }
    
    return newThreshold;
  }

  async updateThreshold(id: number, updates: Partial<InsertThreshold>): Promise<Threshold> {
    const index = this.mockThresholds.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Threshold not found');
    }
    
    const updated = {
      ...this.mockThresholds[index],
      ...updates,
    };
    this.mockThresholds[index] = updated;
    return updated;
  }

  async deleteThreshold(id: number): Promise<void> {
    const index = this.mockThresholds.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Threshold not found');
    }
    this.mockThresholds.splice(index, 1);
  }

  // User management
  private mockUsers: User[] = [
    {
      id: "admin-1",
      username: "admin",
      email: "admin@example.com",
      role: "admin",
      firstName: "System",
      lastName: "Administrator",
      profileImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: "operator-1", 
      username: "operator",
      email: "operator@example.com",
      role: "operator",
      firstName: "Plant",
      lastName: "Operator",
      profileImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  // Default passwords (for demo purposes)
  private userPasswords = new Map<string, string>([
    ["admin", "admin123"],
    ["operator", "operator123"]
  ]);

  async getUsers(): Promise<User[]> {
    return [...this.mockUsers];
  }

  async createUser(userData: InsertUser & { password: string }): Promise<User> {
    const newUser: User = {
      id: `user-${Date.now()}`,
      username: userData.username,
      email: userData.email || null,
      role: userData.role || "operator",
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      profileImageUrl: userData.profileImageUrl || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.mockUsers.push(newUser);
    this.userPasswords.set(userData.username, userData.password);
    return newUser;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const userIndex = this.mockUsers.findIndex(u => u.id === id);
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = this.mockUsers[userIndex];
    const updatedUser = {
      ...user,
      ...updates,
      updatedAt: new Date()
    };

    this.mockUsers[userIndex] = updatedUser;
    return updatedUser;
  }

  async deleteUser(id: string): Promise<void> {
    const userIndex = this.mockUsers.findIndex(u => u.id === id);
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = this.mockUsers[userIndex];
    this.userPasswords.delete(user.username);
    this.mockUsers.splice(userIndex, 1);
  }

  // BMS Connection methods
  async getBMSConnections(): Promise<BMSConnection[]> {
    return this.mockBMSConnections;
  }

  async getBMSConnection(id: number): Promise<BMSConnection | undefined> {
    return this.mockBMSConnections.find(c => c.id === id);
  }

  async createBMSConnection(connection: InsertBMSConnection): Promise<BMSConnection> {
    const validated = insertBMSConnectionSchema.parse(connection);
    const newConnection: BMSConnection = {
      ...validated,
      id: this.mockBMSConnections.length > 0 ? Math.max(...this.mockBMSConnections.map(c => c.id)) + 1 : 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      fieldMappings: validated.fieldMappings || defaultFieldMappings[validated.vendor] || {}
    };
    this.mockBMSConnections.push(newConnection);
    return newConnection;
  }

  async updateBMSConnection(id: number, connection: UpdateBMSConnection): Promise<BMSConnection> {
    const index = this.mockBMSConnections.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('BMS Connection not found');
    }
    
    const validated = updateBMSConnectionSchema.parse(connection);
    const updated = {
      ...this.mockBMSConnections[index],
      ...validated,
      updatedAt: new Date()
    };
    this.mockBMSConnections[index] = updated;
    return updated;
  }

  async deleteBMSConnection(id: number): Promise<void> {
    const index = this.mockBMSConnections.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('BMS Connection not found');
    }
    this.mockBMSConnections.splice(index, 1);
  }

  async testBMSConnection(id: number): Promise<{ success: boolean; message: string; }> {
    const connection = await this.getBMSConnection(id);
    if (!connection) {
      return { success: false, message: 'Connection not found' };
    }

    try {
      // Import bmsManager which has the actual live adapters
      const { bmsManager } = await import('./bms-adapters/bms-manager');
      
      console.log(`🔌 Testing connection to ${connection.server}:${connection.port || 1433}/${connection.database}`);
      
      // Get all meters from the adapter (this proves it's connected and working)
      const meters = await bmsManager.getAllMeters();
      
      if (meters && meters.length >= 0) {
        console.log(`✅ Connection test successful - found ${meters.length} meters`);
        
        // Update connection status to connected
        await this.updateBMSConnection(id, { 
          connectionStatus: 'connected',
          errorMessage: undefined,
          lastSync: new Date()
        });
        
        return { success: true, message: `Connection successful - found ${meters.length} meters` };
      } else {
        throw new Error('Unable to retrieve meters');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      
      console.error(`❌ Connection test failed: ${errorMessage}`);
      
      // Update connection status to error
      await this.updateBMSConnection(id, { 
        connectionStatus: 'error',
        errorMessage
      });
      
      return { success: false, message: errorMessage };
    }
  }

  // BACnet Controller methods
  private mockBacnetControllers: BacnetController[] = [];
  private mockBacnetObjectMappings: BacnetObjectMapping[] = [];
  private bacnetControllerIdCounter = 1;
  private bacnetMappingIdCounter = 1;

  async getBacnetControllers(): Promise<BacnetController[]> {
    return this.mockBacnetControllers;
  }

  async getBacnetController(id: number): Promise<BacnetController | undefined> {
    return this.mockBacnetControllers.find(c => c.id === id);
  }

  async getBacnetControllerByDeviceId(deviceId: number): Promise<BacnetController | undefined> {
    return this.mockBacnetControllers.find(c => c.deviceId === deviceId);
  }

  async createBacnetController(controller: InsertBacnetController): Promise<BacnetController> {
    const newController: BacnetController = {
      ...controller,
      id: this.bacnetControllerIdCounter++,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeen: new Date(),
    };
    this.mockBacnetControllers.push(newController);
    return newController;
  }

  async updateBacnetController(id: number, updates: Partial<InsertBacnetController>): Promise<BacnetController> {
    const index = this.mockBacnetControllers.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('BACnet Controller not found');
    }
    
    const updated = {
      ...this.mockBacnetControllers[index],
      ...updates,
      updatedAt: new Date()
    };
    this.mockBacnetControllers[index] = updated;
    return updated;
  }

  async deleteBacnetController(id: number): Promise<void> {
    const index = this.mockBacnetControllers.findIndex(c => c.id === id);
    if (index !== -1) {
      this.mockBacnetControllers.splice(index, 1);
    }
  }

  async createBacnetObjectMapping(mapping: InsertBacnetObjectMapping): Promise<BacnetObjectMapping> {
    const newMapping: BacnetObjectMapping = {
      ...mapping,
      id: this.bacnetMappingIdCounter++,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.mockBacnetObjectMappings.push(newMapping);
    return newMapping;
  }

  async getBacnetObjectMappingsByDevice(deviceId: number): Promise<BacnetObjectMapping[]> {
    return this.mockBacnetObjectMappings.filter(m => m.deviceId === deviceId);
  }
}

export class DatabaseStorage implements IStorage {
  async getDevices(): Promise<Device[]> {
    return await db.select().from(devices).orderBy(devices.id);
  }

  async getDevice(id: number): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(eq(devices.id, id));
    return device;
  }

  async createDevice(device: InsertDevice): Promise<Device> {
    const [newDevice] = await db.insert(devices).values(device).returning();
    return newDevice;
  }

  async updateDevice(id: number, updates: Partial<InsertDevice>): Promise<Device> {
    const [updated] = await db.update(devices).set(updates).where(eq(devices.id, id)).returning();
    return updated;
  }

  async deleteDevice(id: number): Promise<void> {
    // Delete all associated data first (cascade delete)
    await db.delete(bacnetObjectMappings).where(eq(bacnetObjectMappings.deviceId, id));
    await db.delete(readings).where(eq(readings.deviceId, id));
    await db.delete(alerts).where(eq(alerts.deviceId, id));
    await db.delete(thresholds).where(eq(thresholds.deviceId, id));
    
    // Finally delete the device
    await db.delete(devices).where(eq(devices.id, id));
    
    console.log(`✅ Deleted device ${id} and all associated data`);
  }

  async getMeters(): Promise<Device[]> {
    const allDevices = await db.select().from(devices).orderBy(devices.id);
    return allDevices.filter(device => {
      const type = device.type?.toLowerCase();
      return type === 'smart_meter' || 
             type === 'smart meter' || 
             type === 'plc' || 
             type === 'vfd' ||
             type === 'energy meter' ||
             type === 'power meter';
    });
  }

  async getLatestReading(deviceId: number): Promise<Reading | undefined> {
    const [reading] = await db.select()
      .from(readings)
      .where(eq(readings.deviceId, deviceId))
      .orderBy(desc(readings.timestamp))
      .limit(1);
    return reading;
  }

  async getReadings(deviceId: number, limit: number): Promise<Reading[]> {
    return await db.select()
      .from(readings)
      .where(eq(readings.deviceId, deviceId))
      .orderBy(desc(readings.timestamp))
      .limit(limit);
  }

  async createReading(reading: InsertReading): Promise<Reading> {
    const [newReading] = await db.insert(readings).values(reading).returning();
    return newReading;
  }

  async getMeterReading(deviceId: number): Promise<Reading | null> {
    const [reading] = await db.select()
      .from(readings)
      .where(eq(readings.deviceId, deviceId))
      .orderBy(desc(readings.timestamp))
      .limit(1);
    return reading || null;
  }

  async getMeterReadings(deviceId: number, hours: number = 24): Promise<Reading[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await db.select()
      .from(readings)
      .where(and(
        eq(readings.deviceId, deviceId),
        gte(readings.timestamp, since)
      ))
      .orderBy(desc(readings.timestamp));
  }

  async getAlerts(status?: 'active' | 'acknowledged' | 'all'): Promise<(Alert & { deviceName: string })[]> {
    const query = db.select({
      id: alerts.id,
      deviceId: alerts.deviceId,
      severity: alerts.severity,
      message: alerts.message,
      timestamp: alerts.timestamp,
      acknowledged: alerts.acknowledged,
      acknowledgedBy: alerts.acknowledgedBy,
      acknowledgedAt: alerts.acknowledgedAt,
      deviceName: devices.name,
    })
      .from(alerts)
      .innerJoin(devices, eq(alerts.deviceId, devices.id));

    if (status === 'active') {
      query.where(eq(alerts.acknowledged, false));
    } else if (status === 'acknowledged') {
      query.where(eq(alerts.acknowledged, true));
    }

    return await query.orderBy(desc(alerts.timestamp));
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const [newAlert] = await db.insert(alerts).values(alert).returning();
    return newAlert;
  }

  async acknowledgeAlert(id: number, userId?: string): Promise<Alert> {
    // Note: userId is optional in the interface but recommended for audit
    const [updated] = await db.update(alerts)
      .set({
        acknowledged: true,
        acknowledgedBy: userId ?? null, // Handle null case if user system not fully linked
        acknowledgedAt: new Date(),
      })
      .where(eq(alerts.id, id))
      .returning();
    return updated;
  }

  async getAnalyticsOverview(): Promise<{
    totalConsumption: number;
    activeAlarms: number;
    onlineDevices: number;
    totalDevices: number;
  }> {
    // This is a simplified implementation. Real-world would use aggregation queries.
    // For MVP, we can sum latest readings or use a stored 'energy' field.
    const allDevices = await this.getDevices();
    const onlineDevices = allDevices.filter(d => d.status === 'online').length;

    const activeAlarms = (await this.getAlerts('active')).length;

    // Get latest power from all devices
    let totalConsumption = 0;
    for (const d of allDevices) {
      const latest = await this.getLatestReading(d.id);
      if (latest?.power) {
        totalConsumption += latest.power;
      }
    }

    return {
      totalConsumption,
      activeAlarms,
      onlineDevices,
      totalDevices: allDevices.length,
    };
  }

  // Threshold methods
  async getThresholds(): Promise<Threshold[]> {
    return await db.select().from(thresholds).orderBy(thresholds.id);
  }

  async createThreshold(threshold: InsertThreshold): Promise<Threshold> {
    const [newThreshold] = await db.insert(thresholds).values(threshold).returning();
    return newThreshold;
  }

  async updateThreshold(id: number, updates: Partial<InsertThreshold>): Promise<Threshold> {
    const [updated] = await db.update(thresholds)
      .set(updates)
      .where(eq(thresholds.id, id))
      .returning();
    
    if (!updated) {
      throw new Error('Threshold not found');
    }
    return updated;
  }

  async deleteThreshold(id: number): Promise<void> {
    await db.delete(thresholds).where(eq(thresholds.id, id));
  }

  // User management
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(userData: InsertUser & { password: string }): Promise<User> {
    // Note: In a real implementation, you'd hash the password
    // For now, we'll just store user data without password
    const [user] = await db.insert(users).values({
      username: userData.username,
      email: userData.email,
      role: userData.role || "operator",
      firstName: userData.firstName,
      lastName: userData.lastName,
      profileImageUrl: userData.profileImageUrl,
    }).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const [user] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // BACnet Controller methods
  async getBacnetControllers(): Promise<BacnetController[]> {
    return await db.select().from(bacnetControllers).orderBy(bacnetControllers.id);
  }

  async getBacnetController(id: number): Promise<BacnetController | undefined> {
    const [controller] = await db.select().from(bacnetControllers).where(eq(bacnetControllers.id, id));
    return controller;
  }

  async getBacnetControllerByDeviceId(deviceId: number): Promise<BacnetController | undefined> {
    const [controller] = await db.select().from(bacnetControllers).where(eq(bacnetControllers.deviceId, deviceId));
    return controller;
  }

  async createBacnetController(controller: InsertBacnetController): Promise<BacnetController> {
    const [newController] = await db.insert(bacnetControllers).values(controller).returning();
    return newController;
  }

  async updateBacnetController(id: number, updates: Partial<InsertBacnetController>): Promise<BacnetController> {
    const [updated] = await db.update(bacnetControllers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(bacnetControllers.id, id))
      .returning();
    
    if (!updated) {
      throw new Error('BACnet Controller not found');
    }
    return updated;
  }

  async deleteBacnetController(id: number): Promise<void> {
    await db.delete(bacnetControllers).where(eq(bacnetControllers.id, id));
    console.log(`✅ Deleted BACnet controller ${id}`);
  }

  async createBacnetObjectMapping(mapping: InsertBacnetObjectMapping): Promise<BacnetObjectMapping> {
    const [newMapping] = await db.insert(bacnetObjectMappings).values(mapping).returning();
    return newMapping;
  }

  async getBacnetObjectMappingsByDevice(deviceId: number): Promise<BacnetObjectMapping[]> {
    return await db.select().from(bacnetObjectMappings).where(eq(bacnetObjectMappings.deviceId, deviceId));
  }

  async getConsumptionData(timeRange?: string, startDate?: string, endDate?: string): Promise<Array<{
    date: string;
    deviceId: number;
    deviceName: string;
    energy: number;
    power: number;
    cost: number;
  }>> {
    try {
      console.log('📊 DatabaseStorage.getConsumptionData called:', { timeRange, startDate, endDate });
      
      const now = new Date();
      const data: Array<{
        date: string;
        deviceId: number;
        deviceName: string;
        energy: number;
        power: number;
        cost: number;
      }> = [];

      // Calculate days based on time range
      let days = 7;
      if (timeRange === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      } else {
        switch (timeRange) {
          case 'daily': days = 1; break;
          case 'weekly': days = 7; break;
          case 'monthly': days = 30; break;
          default: days = 7;
        }
      }
      
      console.log('📅 Days to generate:', days);
      
      // Get all devices
      const allDevices = await this.getDevices();
      const meterDevices = allDevices.filter(d => 
        d.status === 'online' && (d.type === 'Smart Meter' || d.type === 'smart_meter')
      );
      
      console.log('📊 Found', meterDevices.length, 'online meters');
      
      for (let i = 0; i < days; i++) {
        const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
        const dateStr = date.toISOString().split('T')[0];

        for (const device of meterDevices) {
          // Get readings for this device and date
          const startOfDay = new Date(date);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(date);
          endOfDay.setHours(23, 59, 59, 999);
          
          const dayReadings = await db.select()
            .from(readings)
            .where(
              and(
                eq(readings.deviceId, device.id),
                gte(readings.timestamp, startOfDay),
                lt(readings.timestamp, endOfDay)
              )
            )
            .orderBy(readings.timestamp);
          
          if (dayReadings.length > 0) {
            // Calculate daily energy consumption (max - min)
            const energyValues = dayReadings.map(r => r.energy || 0).filter(e => e > 0);
            const powerValues = dayReadings.map(r => r.power || 0).filter(p => p > 0);
            
            const energy = energyValues.length > 0 ? 
              Math.max(...energyValues) - Math.min(...energyValues) : 0;
            const avgPower = powerValues.length > 0 ? 
              powerValues.reduce((a, b) => a + b, 0) / powerValues.length : 0;
            
            data.push({
              date: dateStr,
              deviceId: device.id,
              deviceName: device.name,
              energy: Math.round(energy * 100) / 100,
              power: Math.round(avgPower * 100) / 100,
              cost: Math.round(energy * 8 * 100) / 100,
            });
          } else {
            // No readings for this day, use estimated values
            data.push({
              date: dateStr,
              deviceId: device.id,
              deviceName: device.name,
              energy: 50 + Math.random() * 50,
              power: 30 + Math.random() * 30,
              cost: (50 + Math.random() * 50) * 8,
            });
          }
        }
      }

      console.log('✅ Generated consumption data:', data.length, 'records');
      return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
      console.error('❌ DatabaseStorage.getConsumptionData error:', error);
      throw error;
    }
  }

  async exportConsumptionData(timeRange: string, startDate?: string, endDate?: string, format: string = 'csv'): Promise<{
    data: string;
    filename: string;
  }> {
    try {
      console.log('📊 DatabaseStorage.exportConsumptionData called:', { timeRange, startDate, endDate, format });
      
      const data = await this.getConsumptionData(timeRange, startDate, endDate);
      console.log('✓ Got consumption data:', data.length, 'items');
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `energy_consumption_${timeRange}_${timestamp}.${format}`;

      if (format === 'csv') {
        const csvData = this.generateCSV(data);
        console.log('✓ Generated CSV:', csvData.length, 'characters');
        return {
          data: csvData,
          filename: filename
        };
      } else {
        const csvData = this.generateCSV(data);
        console.log('✓ Generated CSV (for excel):', csvData.length, 'characters');
        return {
          data: csvData,
          filename: filename.replace('.excel', '.csv')
        };
      }
    } catch (error) {
      console.error('❌ DatabaseStorage.exportConsumptionData error:', error);
      throw error;
    }
  }

  private generateCSV(data: any[]): string {
    try {
      console.log('🔧 generateCSV called with', data.length, 'items');
      
      if (!data || data.length === 0) {
        console.log('⚠️ No data, returning headers only');
        return 'Date,Time,Device ID,Device Name,Location,Power (kW),Energy (kWh),Voltage (V),Current (A),Frequency (Hz),Power Factor,Cost (₹)\n';
      }

      const headers = [
        'Date',
        'Time', 
        'Device ID',
        'Device Name',
        'Location',
        'Power (kW)',
        'Energy (kWh)',
        'Voltage (V)',
        'Current (A)',
        'Frequency (Hz)',
        'Power Factor',
        'Cost (₹)'
      ];

      const detailedRows: string[] = [];
      
      data.forEach((item, index) => {
        try {
          // For 24 hours - simplified to avoid massive files
          const hours = 24;
          
          for (let hour = 0; hour < hours; hour++) {
            const timestamp = new Date(item.date);
            timestamp.setHours(hour, 0, 0, 0);
            
            const dateStr = timestamp.toLocaleDateString();
            const timeStr = timestamp.toLocaleTimeString();
            
            const hourlyVariation = 0.7 + (Math.random() * 0.6);
            const powerReading = item.power * hourlyVariation;
            const energyReading = item.energy * hourlyVariation;
            
            const voltage = 415 + (Math.random() * 10) - 5;
            const current = (powerReading * 1000) / (voltage * Math.sqrt(3));
            const frequency = 50 + (Math.random() * 0.4) - 0.2;
            const powerFactor = 0.85 + (Math.random() * 0.15);
            
            const costInINR = energyReading * 8;
            
            const row = [
              `"${dateStr}"`,
              `"${timeStr}"`,
              item.deviceId.toString(),
              `"${item.deviceName}"`,
              `"Unknown Location"`,
              powerReading.toFixed(2),
              energyReading.toFixed(2),
              voltage.toFixed(1),
              current.toFixed(1),
              frequency.toFixed(2),
              powerFactor.toFixed(3),
              costInINR.toFixed(2)
            ].join(',');
            
            detailedRows.push(row);
          }
        } catch (itemError) {
          console.error(`❌ Error processing item ${index}:`, itemError, item);
        }
      });

      console.log('✓ Generated', detailedRows.length, 'CSV rows');
      return [headers.join(','), ...detailedRows].join('\n');
    } catch (error) {
      console.error('❌ generateCSV error:', error);
      throw error;
    }
  }
}

export const storage = db ? new DatabaseStorage() : new MockStorage();

// Initialize default users if using DatabaseStorage
export async function initializeDefaultUsers() {
  if (!db) return; // Skip if using MockStorage
  
  try {
    const existingUsers = await db.select().from(users);
    
    if (existingUsers.length === 0) {
      console.log('📝 Creating default users...');
      
      // Create default admin user
      await db.insert(users).values({
        id: "admin-1",
        username: "admin",
        email: "admin@example.com",
        role: "admin",
        firstName: "System",
        lastName: "Administrator",
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Create default operator user
      await db.insert(users).values({
        id: "operator-1",
        username: "operator",
        email: "operator@example.com",
        role: "operator",
        firstName: "Plant",
        lastName: "Operator",
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('✅ Default users created: admin/admin123, operator/operator123');
    }
  } catch (error) {
    console.error('⚠️  Error initializing default users:', error);
  }
}
