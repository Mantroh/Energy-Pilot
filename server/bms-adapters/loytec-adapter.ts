import { exec } from 'child_process';
import { promisify } from 'util';
import { BMSAdapter, BMSMeter, BMSReading, BMSAlarm } from './base-adapter';

const execAsync = promisify(exec);

interface LoytecDatabaseConfig {
  server: string;
  database: string;
  user?: string;
  password?: string;
}

/**
 * Loytec/BACnet BMS Adapter (sqlcmd-based)
 * Connects to Loytec LIOB-589 or similar gateway SQL Server databases
 * METRO_BHAWAN structure: TrendLogs, AlarmLogs, LogInfo, LogItemInfo
 * Uses sqlcmd directly for more reliable Windows connections
 */
export class LoytecAdapter implements BMSAdapter {
  private config: LoytecDatabaseConfig;
  private isConnected = false;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(config: LoytecDatabaseConfig) {
    this.config = config;
  }

  /**
   * Execute SQL query using sqlcmd via PowerShell
   */
  private async executeSqlCommand(query: string): Promise<string> {
    try {
      // Escape single quotes in the query for PowerShell
      const escapedQuery = query.replace(/'/g, "''");
      
      // Build sqlcmd command with proper escaping for PowerShell
      let sqlcmdCmd = `sqlcmd -S ${this.config.server} -d ${this.config.database}`;
      
      // Add authentication if user/password provided
      if (this.config.user && this.config.password) {
        sqlcmdCmd += ` -U ${this.config.user} -P '${this.config.password}'`;
      } else {
        // Use Windows auth
        sqlcmdCmd += ` -E`;
      }
      
      // Use single quotes for the query in PowerShell (literal string)
      sqlcmdCmd += ` -Q '${escapedQuery}' -h -1`;
      
      // Execute via PowerShell with proper escaping
      const psCmd = `powershell -NoProfile -Command "${sqlcmdCmd}"`;
      
      const { stdout, stderr } = await execAsync(psCmd, { maxBuffer: 10 * 1024 * 1024, timeout: 10000 });
      
      if (stderr && !stderr.includes('rows affected')) {
        console.warn(`SQL Warning: ${stderr}`);
      }
      
      return stdout;
    } catch (error: any) {
      throw new Error(`SQL Query failed: ${error.message || 'Unknown error'}`);
    }
  }

  async connect(): Promise<boolean> {
    try {
      console.log(`🔌 Attempting to connect to SQL Server: ${this.config.server}\\${this.config.database}`);
      
      // Test connection with simple query
      const result = await this.executeSqlCommand('SELECT @@VERSION');
      
      if (result && result.length > 0) {
        this.isConnected = true;
        console.log(`✅ Connected to Loytec BMS: ${this.config.database}`);
        const lines = result.split('\n');
        const versionLine = lines[0];
        if (versionLine) {
          console.log(`   SQL Server: ${versionLine.substring(0, 60)}...`);
        }
        return true;
      } else {
        throw new Error('No response from SQL Server');
      }
    } catch (error: any) {
      console.error(`❌ Loytec connection failed: ${error.message}`);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('Disconnected from Loytec BMS');
  }

  async validateSchema(): Promise<boolean> {
    if (!this.isConnected) return false;
    
    try {
      const result = await this.executeSqlCommand(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'TrendLog%' OR TABLE_NAME LIKE 'AlarmLog%'`);
      return result && result.length > 0;
    } catch (error) {
      console.error('Schema validation failed:', error);
      return false;
    }
  }

  async getMeters(): Promise<BMSMeter[]> {
    if (!this.isConnected) throw new Error('Not connected to Loytec BMS');
    
    try {
      // Get TrendLog tables to understand meter count
      const result = await this.executeSqlCommand(`SELECT COUNT(*) as TableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'TrendLog%'`);
      
      // Return a single aggregate meter for the BMS
      const meters: BMSMeter[] = [
        {
          id: 'METRO_BHAWAN_MAIN',
          name: 'METRO BHAWAN BMS System',
          type: 'Loytec Building Management System',
          location: `${this.config.database} Database (${this.config.server})`,
          isOnline: true,
          lastSeen: new Date(),
          metadata: {
            source: 'loytec',
            database: this.config.database,
            server: this.config.server,
            adaptationType: 'sqlcmd'
          }
        }
      ];

      console.log(`📊 Connected to Loytec ${this.config.database} database with ${result.trim()} TrendLog tables`);
      return meters;
    } catch (error) {
      console.error('Error fetching meters:', error);
      return [];
    }
  }

  async getRealtimeData(meterId?: string): Promise<BMSReading[]> {
    if (!this.isConnected) throw new Error('Not connected to Loytec BMS');
    
    try {
      // Get latest readings from main TrendLog
      const result = await this.executeSqlCommand(`SELECT TOP 50 ItemIndex, Value FROM TrendLog_00000001 WHERE Value IS NOT NULL ORDER BY CAST(Timestamp AS BIGINT) DESC`);

      const readings: BMSReading[] = [];
      const lines = result.split('\n').filter(l => l.trim() && !l.includes('ItemIndex'));
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          try {
            const value = parseFloat(parts[1]);
            if (!isNaN(value)) {
              readings.push({
                meterId: meterId || 'METRO_BHAWAN_MAIN',
                timestamp: new Date(),
                parameters: {
                  activePower: value > 0 ? value : 0,
                },
                quality: 'good' as const,
              });
            }
          } catch (e) {
            // Skip parse errors
          }
        }
      }

      return readings;
    } catch (error) {
      console.error('Error fetching realtime data:', error);
      return [];
    }
  }

  async getAlarms(activeOnly: boolean = true): Promise<BMSAlarm[]> {
    if (!this.isConnected) throw new Error('Not connected to Loytec BMS');
    
    try {
      const query = `SELECT TOP 20 LogId, SeqNum, Message FROM AlarmLog_00000001 ORDER BY CAST(SeqNum AS INT) DESC`;
      const result = await this.executeSqlCommand(query);

      const alarms: BMSAlarm[] = [];
      const lines = result.split('\n').filter(l => l.trim() && !l.includes('LogId'));
      
      let id = 1;
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 1) {
          alarms.push({
            id: `ALARM_${id++}`,
            meterId: 'METRO_BHAWAN_MAIN',
            type: 'BMS Alert',
            severity: 'medium' as const,
            message: parts.slice(2).join(' ') || 'Unknown alarm',
            timestamp: new Date(),
            isActive: true,
          });
        }
      }

      return alarms;
    } catch (error) {
      console.error('Error fetching alarms:', error);
      return [];
    }
  }

  async getHistoricalData(meterId: string, startTime: Date, endTime: Date): Promise<BMSReading[]> {
    if (!this.isConnected) throw new Error('Not connected to Loytec BMS');
    
    try {
      // Query historical data
      const result = await this.executeSqlCommand(`SELECT TOP 500 ItemIndex, Value FROM TrendLog_00000001 WHERE Value IS NOT NULL ORDER BY CAST(Timestamp AS BIGINT) DESC`);

      const readings: BMSReading[] = [];
      const lines = result.split('\n').filter(l => l.trim() && !l.includes('ItemIndex'));
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          try {
            const value = parseFloat(parts[1]);
            if (!isNaN(value)) {
              readings.push({
                meterId,
                timestamp: startTime,
                parameters: {
                  activePower: value > 0 ? value : 0,
                },
                quality: 'good' as const,
              });
            }
          } catch (e) {
            // Skip parse errors
          }
        }
      }

      return readings;
    } catch (error) {
      console.error('Error fetching historical data:', error);
      return [];
    }
  }

  startSync(intervalMinutes: number): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    
    const intervalMs = intervalMinutes * 60 * 1000;
    this.syncInterval = setInterval(async () => {
      try {
        await this.getRealtimeData();
        console.log(`✅ Loytec sync completed`);
      } catch (error) {
        console.error('Sync error:', error);
      }
    }, intervalMs);
    
    console.log(`📡 Loytec sync started (every ${intervalMinutes} minutes)`);
  }

  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Loytec sync stopped');
    }
  }
}
