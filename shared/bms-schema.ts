// BMS Connection Management Schema
import { z } from "zod";

// BMS Connection Schema
export const insertBMSConnectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  vendor: z.enum(["schneider", "siemens", "abb", "johnson_controls", "file", "custom", "loytec"]),
  
  // Database connection details
  server: z.string().min(1, "Server is required"),
  port: z.number().int().positive().optional().default(1433),
  database: z.string().min(1, "Database name is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().optional().default(""),
  
  // Connection options
  trustServerCertificate: z.boolean().default(true),
  encrypt: z.boolean().default(false),
  enableArithAbort: z.boolean().default(true),
  
  // Sync settings
  enableRealtime: z.boolean().default(true),
  intervalMinutes: z.number().int().min(1).max(60).default(5),
  
  // Field mappings (JSON stored as string)
  fieldMappings: z.record(z.any()).optional(),
  
  // Status and metadata
  isEnabled: z.boolean().default(true),
  lastSync: z.date().optional(),
  connectionStatus: z.enum(["connected", "disconnected", "error", "testing"]).default("disconnected"),
  errorMessage: z.string().optional(),
});

export const updateBMSConnectionSchema = insertBMSConnectionSchema.partial();

export type InsertBMSConnection = z.infer<typeof insertBMSConnectionSchema>;
export type UpdateBMSConnection = z.infer<typeof updateBMSConnectionSchema>;

export interface BMSConnection extends InsertBMSConnection {
  id: number;
  createdAt: Date;
  updatedAt: Date;
}

// Default field mappings for different vendors
export const defaultFieldMappings = {
  schneider: {
    meters: {
      id: "DeviceID",
      name: "DeviceName", 
      type: "DeviceType",
      location: "Location",
      isOnline: "IsOnline",
      lastSeen: "LastCommunication"
    },
    readings: {
      meterId: "DeviceID",
      timestamp: "TimeStamp",
      activePower: "ActivePowerTotal_kW",
      voltage: {
        L1: "VoltageL1N_V",
        L2: "VoltageL2N_V", 
        L3: "VoltageL3N_V"
      },
      current: {
        L1: "CurrentL1_A",
        L2: "CurrentL2_A",
        L3: "CurrentL3_A"
      },
      energy: "TotalActiveEnergy_kWh",
      frequency: "Frequency_Hz",
      powerFactor: "PowerFactor"
    },
    alarms: {
      id: "AlarmID",
      meterId: "DeviceID",
      message: "AlarmText",
      severity: "Priority",
      isActive: "IsActive",
      timestamp: "AlarmDateTime",
      acknowledgedAt: "AcknowledgedDateTime"
    }
  },
  siemens: {
    meters: {
      id: "DeviceID",
      name: "DeviceName",
      type: "DeviceType", 
      location: "Location",
      isOnline: "IsOnline",
      lastSeen: "LastCommunication"
    },
    readings: {
      meterId: "DeviceID",
      timestamp: "Timestamp",
      activePower: "ActivePowerTotal_kW",
      voltage: {
        L1: "VoltageL1_V",
        L2: "VoltageL2_V",
        L3: "VoltageL3_V"
      },
      current: {
        L1: "CurrentL1_A", 
        L2: "CurrentL2_A",
        L3: "CurrentL3_A"
      },
      energy: "TotalActiveEnergy_kWh",
      frequency: "Frequency_Hz",
      powerFactor: "PowerFactor"
    },
    alarms: {
      id: "AlarmID",
      meterId: "DeviceID", 
      message: "AlarmDescription",
      severity: "Priority",
      isActive: "IsActive",
      timestamp: "AlarmDateTime",
      acknowledgedAt: "AcknowledgedAt"
    }
  },
  custom: {
    meters: {
      id: "id",
      name: "name",
      type: "type",
      location: "location", 
      isOnline: "online",
      lastSeen: "last_seen"
    },
    readings: {
      meterId: "meter_id",
      timestamp: "timestamp",
      activePower: "active_power",
      voltage: "voltage",
      current: "current", 
      energy: "energy",
      frequency: "frequency",
      powerFactor: "power_factor"
    },
    alarms: {
      id: "id",
      meterId: "meter_id",
      message: "message",
      severity: "severity",
      isActive: "is_active", 
      timestamp: "timestamp",
      acknowledgedAt: "acknowledged_at"
    }
  }
};