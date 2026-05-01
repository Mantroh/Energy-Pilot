// Multi-vendor BMS Configuration Management

export interface BMSConnectionConfig {
  id: string;
  name: string;
  vendor: 'schneider' | 'siemens' | 'abb' | 'johnson_controls' | 'file' | 'custom' | 'loytec';
  
  // Database connection
  database?: {
    server: string;
    port?: number;
    database: string;
    user: string;
    password: string;
    options?: {
      trustServerCertificate?: boolean;
      encrypt?: boolean;
      enableArithAbort?: boolean;
    };
  };

  // File-based configuration (for CSV/JSON data sources)
  fileConfig?: {
    format: 'csv' | 'json' | 'xml';
    metersFile?: string;
    readingsFile?: string;
    alarmsFile?: string;
    metersDirectory?: string;
    readingsDirectory?: string;
    alarmsDirectory?: string;
    csvOptions?: {
      delimiter: string;
      hasHeaders: boolean;
      skipRows: number;
    };
    fieldMappings: {
      meters: {
        id: string;
        name: string;
        type: string;
        location?: string;
        isOnline?: string;
        lastSeen?: string;
      };
      readings: {
        meterId: string;
        timestamp: string;
        activePower?: string;
        voltage?: string | { L1: string; L2: string; L3: string; };
        current?: string | { L1: string; L2: string; L3: string; };
        energy?: string;
        frequency?: string;
        powerFactor?: string;
      };
      alarms?: {
        id: string;
        meterId: string;
        message: string;
        severity?: string;
        isActive?: string;
        timestamp: string;
        acknowledgedAt?: string;
      };
    };
    refreshIntervalSeconds?: number;
    watchForChanges?: boolean;
  };
  
  // Synchronization settings
  sync: {
    enableRealtime: boolean;
    intervalMinutes: number;
  };
  
  // Custom field mappings (for custom/unknown vendors)
  customMappings?: {
    tables?: Record<string, string>;
    fields?: Record<string, any>;
    transformations?: Record<string, any>;
  };
}

// Load configurations dynamically from environment variables
export function loadBMSConfigurations(): BMSConnectionConfig[] {
  const configurations: BMSConnectionConfig[] = [];
  
  // Load from environment variables
  const configSources = [
    process.env.BMS_CONFIG_PRIMARY,
    process.env.BMS_CONFIG_SCHNEIDER, 
    process.env.BMS_CONFIG_SIEMENS,
    process.env.BMS_CONFIG_FILES,
    process.env.BMS_CONFIG_DEV
  ].filter(Boolean);
  
  // If no specific configs found, check for legacy environment variables
  if (configSources.length === 0 && process.env.BMS_SERVER) {
    console.log('📡 Using legacy BMS configuration from environment variables');
    const legacyConfig = createLegacyConfig();
    if (legacyConfig) {
      configurations.push(legacyConfig);
    }
  }
  
  // Parse JSON configurations
  for (const configJson of configSources) {
    try {
      const configs = JSON.parse(configJson!);
      if (Array.isArray(configs)) {
        configurations.push(...configs);
      } else {
        configurations.push(configs);
      }
    } catch (error) {
      console.error('❌ Error parsing BMS configuration:', error);
    }
  }
  
  // If still no configurations, return empty array
  if (configurations.length === 0) {
    console.log('ℹ️  No BMS configurations found - running without BMS integration');
    return [];
  }
  
  // Validate configurations
  return configurations.filter(config => {
    const errors = validateBMSConfig(config);
    if (errors.length > 0) {
      console.error(`❌ Configuration validation failed for ${config.name}:`, errors);
      return false;
    }
    return true;
  });
}

// Create legacy configuration from environment variables
function createLegacyConfig(): BMSConnectionConfig | null {
  if (!process.env.BMS_SERVER || !process.env.BMS_DATABASE || !process.env.BMS_USER) {
    return null;
  }
  
  // Detect vendor from BMS_VENDOR environment variable, default to loytec
  const vendor = (process.env.BMS_VENDOR || 'loytec') as 'schneider' | 'siemens' | 'loytec' | 'abb' | 'johnson_controls' | 'file' | 'custom';
  
  return {
    id: 'legacy-bms',
    name: `BMS Connection (${vendor.toUpperCase()})`,
    vendor: vendor,
    database: {
      server: process.env.BMS_SERVER,
      database: process.env.BMS_DATABASE,
      user: process.env.BMS_USER,
      password: process.env.BMS_PASSWORD || '',
      options: {
        trustServerCertificate: true,
        encrypt: false
      }
    },
    sync: {
      enableRealtime: true,
      intervalMinutes: parseInt(process.env.BMS_SYNC_INTERVAL || '2')
    }
  };
}

// Configuration validator
export function validateBMSConfig(config: BMSConnectionConfig): string[] {
  const errors: string[] = [];
  
  if (!config.name) errors.push('Name is required');
  if (!config.id) errors.push('ID is required');
  
  // Validate database config if present
  if (config.database) {
    if (!config.database.server) errors.push('Database server is required');
    if (!config.database.user) errors.push('Database username is required');
    if (!config.database.database) errors.push('Database name is required');
  }
  
  // Validate file config if present
  if (config.fileConfig) {
    if (!config.fileConfig.format) errors.push('File format is required');
    if (!config.fileConfig.metersFile && !config.fileConfig.metersDirectory) {
      errors.push('Either metersFile or metersDirectory is required for file configuration');
    }
  }
  
  // At least one configuration method required
  if (!config.database && !config.fileConfig) {
    errors.push('Either database or file configuration is required');
  }
  
  if (config.sync.intervalMinutes && config.sync.intervalMinutes < 1) {
    errors.push('Sync interval must be at least 1 minute');
  }
  
  return errors;
}

// Environment variable helpers
export function getBMSEnvVar(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

export function parseBMSEnvVar(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}