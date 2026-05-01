import { BMSAdapter, BMSMeter, BMSReading, BMSAlarm } from './base-adapter';
import { SchneiderAdapter } from './schneider-adapter';
import { LoytecAdapter } from './loytec-adapter';
// Import other adapters as needed
// import { SiemensAdapter } from './siemens-adapter';
// import { ABBAdapter } from './abb-adapter';
// import { CustomAdapter } from './custom-adapter';

import { BMSConnectionConfig, loadBMSConfigurations } from './bms-config';
import { storage } from '../storage';
import { log } from '../index';

export class BMSManager {
  private adapters: Map<string, BMSAdapter> = new Map();
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    const configurations = loadBMSConfigurations();
    log(`Loading ${configurations.length} BMS configurations`, 'BMS-Manager');
    
    for (const config of configurations) {
      try {
        const adapter = this.createAdapter(config);
        if (adapter && await adapter.connect()) {
          this.adapters.set(config.id, adapter);
          
          // Start sync if configured
          if (config.sync.enableRealtime) {
            this.startSync(config.id, config.sync.intervalMinutes);
          }
          
          log(`✅ Initialized BMS adapter: ${config.name}`, 'BMS-Manager');
        } else {
          log(`❌ Failed to initialize BMS adapter: ${config.name}`, 'BMS-Manager');
        }
      } catch (error) {
        log(`❌ Error initializing ${config.name}: ${error}`, 'BMS-Manager');
      }
    }
    
    this.isInitialized = true;
    log(`🚀 BMS Manager initialized with ${this.adapters.size} active connections`, 'BMS-Manager');
  }

  private createAdapter(config: BMSConnectionConfig): BMSAdapter | null {
    switch (config.vendor) {
      case 'schneider':
        return new SchneiderAdapter(config.database);
      
      case 'loytec':
        return new LoytecAdapter(config.database);
      
      // case 'siemens':
      //   return new SiemensAdapter(config.database);
      
      // case 'abb':
      //   return new ABBAdapter(config.database);
      
      // case 'custom':
      //   return new CustomAdapter(config.database, config.customMappings);
      
      default:
        log(`❌ Unsupported BMS vendor: ${config.vendor}`, 'BMS-Manager');
        return null;
    }
  }

  // Aggregate data from all connected BMS systems
  async getAllMeters(): Promise<BMSMeter[]> {
    const allMeters: BMSMeter[] = [];
    
    for (const [configId, adapter] of this.adapters) {
      try {
        const meters = await adapter.getMeters();
        // Add source information to each meter
        meters.forEach(meter => {
          meter.metadata = { ...meter.metadata, sourceConfigId: configId };
        });
        allMeters.push(...meters);
      } catch (error) {
        log(`Error fetching meters from ${configId}: ${error}`, 'BMS-Manager');
      }
    }
    
    return allMeters;
  }

  async getAllRealtimeData(meterId?: string): Promise<BMSReading[]> {
    const allReadings: BMSReading[] = [];
    
    for (const [configId, adapter] of this.adapters) {
      try {
        const readings = await adapter.getRealtimeData(meterId);
        allReadings.push(...readings);
      } catch (error) {
        log(`Error fetching realtime data from ${configId}: ${error}`, 'BMS-Manager');
      }
    }
    
    return allReadings;
  }

  async getAllAlarms(activeOnly: boolean = true): Promise<BMSAlarm[]> {
    const allAlarms: BMSAlarm[] = [];
    
    for (const [configId, adapter] of this.adapters) {
      try {
        const alarms = await adapter.getAlarms(activeOnly);
        allAlarms.push(...alarms);
      } catch (error) {
        log(`Error fetching alarms from ${configId}: ${error}`, 'BMS-Manager');
      }
    }
    
    return allAlarms;
  }

  // Sync data from BMS to internal storage
  private async syncData(): Promise<void> {
    try {
      // 1. Sync meters/devices
      const bmsMeters = await this.getAllMeters();
      for (const bmsMeter of bmsMeters) {
        await this.syncMeterToStorage(bmsMeter);
      }
      
      // 2. Sync realtime readings
      const bmsReadings = await this.getAllRealtimeData();
      for (const reading of bmsReadings) {
        await this.syncReadingToStorage(reading);
      }
      
      // 3. Sync alarms
      const bmsAlarms = await this.getAllAlarms();
      for (const alarm of bmsAlarms) {
        await this.syncAlarmToStorage(alarm);
      }
      
      log(`✅ BMS sync completed: ${bmsMeters.length} meters, ${bmsReadings.length} readings, ${bmsAlarms.length} alarms`, 'BMS-Manager');
      
    } catch (error) {
      log(`❌ BMS sync error: ${error}`, 'BMS-Manager');
    }
  }

  private async syncMeterToStorage(bmsMeter: BMSMeter): Promise<void> {
    try {
      // Check if device exists in our storage
      const existingDevice = await storage.getDevice(parseInt(bmsMeter.id));
      
      if (!existingDevice) {
        // Create new device
        await storage.createDevice({
          name: bmsMeter.name,
          type: bmsMeter.type.includes('meter') ? 'smart_meter' : 'plc',
          location: bmsMeter.location,
          status: bmsMeter.isOnline ? 'online' : 'offline',
          ipAddress: `BMS-${bmsMeter.metadata?.sourceConfigId}`,
          lastSeen: bmsMeter.lastSeen,
          config: bmsMeter.metadata
        });
      } else {
        // Update existing device
        await storage.updateDevice(parseInt(bmsMeter.id), {
          status: bmsMeter.isOnline ? 'online' : 'offline',
          lastSeen: bmsMeter.lastSeen
        });
      }
    } catch (error) {
      log(`Error syncing meter ${bmsMeter.name}: ${error}`, 'BMS-Manager');
    }
  }

  private async syncReadingToStorage(reading: BMSReading): Promise<void> {
    try {
      await storage.createReading({
        deviceId: parseInt(reading.meterId),
        power: reading.parameters.activePower || 0,
        voltage: reading.parameters.voltage ? 
          (reading.parameters.voltage.L1 + reading.parameters.voltage.L2 + reading.parameters.voltage.L3) / 3 : 0,
        current: reading.parameters.current ? 
          (reading.parameters.current.L1 + reading.parameters.current.L2 + reading.parameters.current.L3) / 3 : 0,
        energy: reading.parameters.energy || 0,
        frequency: reading.parameters.frequency || 50,
        powerFactor: reading.parameters.powerFactor || 0.9,
        timestamp: reading.timestamp
      });
    } catch (error) {
      // Silent fail for reading sync to prevent spam
    }
  }

  private async syncAlarmToStorage(alarm: BMSAlarm): Promise<void> {
    if (!alarm.isActive) return; // Only sync active alarms
    
    try {
      await storage.createAlert({
        deviceId: parseInt(alarm.meterId),
        type: 'bms_alarm',
        severity: alarm.severity === 'critical' ? 'critical' : 
                 alarm.severity === 'high' ? 'warning' : 'info',
        message: `BMS Alert: ${alarm.message}`,
        status: 'active',
        timestamp: alarm.timestamp
      });
    } catch (error) {
      log(`Error syncing alarm ${alarm.id}: ${error}`, 'BMS-Manager');
    }
  }

  private startSync(configId: string, intervalMinutes: number): void {
    const interval = setInterval(() => {
      this.syncData();
    }, intervalMinutes * 60 * 1000);
    
    this.syncIntervals.set(configId, interval);
    log(`🔄 Started sync for ${configId} (${intervalMinutes} min intervals)`, 'BMS-Manager');
  }

  async shutdown(): Promise<void> {
    // Stop all sync intervals
    for (const [configId, interval] of this.syncIntervals) {
      clearInterval(interval);
      log(`⏹️  Stopped sync for ${configId}`, 'BMS-Manager');
    }
    this.syncIntervals.clear();
    
    // Disconnect all adapters
    for (const [configId, adapter] of this.adapters) {
      try {
        await adapter.disconnect();
        log(`🔌 Disconnected ${configId}`, 'BMS-Manager');
      } catch (error) {
        log(`Error disconnecting ${configId}: ${error}`, 'BMS-Manager');
      }
    }
    this.adapters.clear();
    
    this.isInitialized = false;
    log('🛑 BMS Manager shutdown complete', 'BMS-Manager');
  }

  // Status and health monitoring
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      activeConnections: this.adapters.size,
      connectedSystems: Array.from(this.adapters.keys()),
      syncIntervals: Array.from(this.syncIntervals.keys())
    };
  }

  // Load UI-created connections from storage and reinitialize adapters
  async reloadFromStorage(): Promise<void> {
    try {
      log(`🔄 Reloading BMS connections from storage`, 'BMS-Manager');
      
      // Get UI-created connections from storage
      const uiConnections = await storage.getBMSConnections();
      
      if (uiConnections.length === 0) {
        log(`ℹ️  No BMS connections found in storage`, 'BMS-Manager');
        return;
      }
      
      for (const connection of uiConnections) {
        if (!connection.isEnabled) continue;
        
        try {
          // Convert UI connection to adapter config
          const config: BMSConnectionConfig = {
            id: `bms-${connection.id}`,
            name: connection.name,
            vendor: connection.vendor as any,
            database: {
              server: connection.server,
              port: connection.port,
              database: connection.database,
              user: connection.username,
              password: connection.password,
              options: {
                trustServerCertificate: connection.trustServerCertificate,
                encrypt: connection.encrypt,
                enableArithAbort: connection.enableArithAbort
              }
            },
            sync: {
              enableRealtime: connection.enableRealtime,
              intervalMinutes: connection.intervalMinutes
            }
          };
          
          // Initialize or reinitialize adapter
          const adapter = this.createAdapter(config);
          if (adapter && await adapter.connect()) {
            // Stop existing sync interval if any
            const existingInterval = this.syncIntervals.get(config.id);
            if (existingInterval) {
              clearInterval(existingInterval);
              this.syncIntervals.delete(config.id);
            }
            
            // Disconnect existing adapter if any
            const existingAdapter = this.adapters.get(config.id);
            if (existingAdapter) {
              await existingAdapter.disconnect();
            }
            
            this.adapters.set(config.id, adapter);
            
            // Start sync if configured
            if (config.sync.enableRealtime) {
              this.startSync(config.id, config.sync.intervalMinutes);
            }
            
            log(`✅ Initialized BMS adapter from storage: ${config.name}`, 'BMS-Manager');
          } else {
            log(`❌ Failed to initialize BMS adapter from storage: ${config.name}`, 'BMS-Manager');
          }
        } catch (error) {
          log(`❌ Error initializing ${connection.name}: ${error}`, 'BMS-Manager');
        }
      }
      
      log(`🚀 BMS Manager reloaded from storage with ${this.adapters.size} active connections`, 'BMS-Manager');
    } catch (error) {
      log(`❌ Error reloading BMS connections from storage: ${error}`, 'BMS-Manager');
    }
  }

  // Remove an adapter
  async removeAdapter(connectionId: number): Promise<void> {
    const adapterId = `bms-${connectionId}`;
    
    try {
      // Stop sync interval
      const interval = this.syncIntervals.get(adapterId);
      if (interval) {
        clearInterval(interval);
        this.syncIntervals.delete(adapterId);
      }
      
      // Disconnect adapter
      const adapter = this.adapters.get(adapterId);
      if (adapter) {
        await adapter.disconnect();
        this.adapters.delete(adapterId);
      }
      
      log(`🗑️  Removed BMS adapter: ${adapterId}`, 'BMS-Manager');
    } catch (error) {
      log(`Error removing adapter ${adapterId}: ${error}`, 'BMS-Manager');
    }
  }
}

// Export singleton instance
export const bmsManager = new BMSManager();