/**
 * Import Trend Log CSV Data
 * Parses LogInfo.csv and LogItemInfo.csv to extract:
 * - Trend log metadata (tables, sources, record counts)
 * - Individual parameter definitions (units, paths, indexes)
 * - Energy meter parameters (kWh, kW, A, V, Hz, etc.)
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

interface LogInfoRecord {
  Id: string;
  Type: string;
  SourceId: string;
  SourceName: string;
  AbsolutePath: string;
  SourceTotalCnt: string;
  ServerTotalCnt: string;
  ServerRecCnt: string;
  FirstTimestamp: string;
  LastTimestamp: string;
  TableName: string;
}

interface LogItemInfoRecord {
  LogId: string;
  ItemId: string;
  ItemIndex: string;
  AbsolutePath: string;
  Unit: string;
  AggregationMode: string;
  Compression: string;
}

interface TrendLogData {
  id: number;
  logId: number;
  logType: number;
  sourceId: number | null;
  sourceName: string;
  absolutePath: string;
  tableName: string;
  sourceRecordCount: number | null;
  serverRecordCount: number | null;
  firstTimestamp: bigint | null;
  lastTimestamp: bigint | null;
  isActive: boolean;
}

interface TrendLogItemData {
  logId: number;
  itemId: number | null;
  itemIndex: number;
  absolutePath: string;
  unit: string;
  aggregationMode: number | null;
  compression: string | null;
}

// Energy meter related keywords to find relevant trend logs
const ENERGY_KEYWORDS = [
  'kwh', 'kw', 'power', 'energy', 'amp', 'volt', 'current', 'voltage', 'hz', 'frequency',
  'meter', 'demand', 'consumption', 'active', 'reactive', 'apparent',
  'l1', 'l2', 'l3', 'phase', 'neutral'
];

function isEnergyRelated(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return ENERGY_KEYWORDS.some(keyword => lower.includes(keyword));
}

function extractUnit(absolutePath: string): string | null {
  // Extract unit from path like "Datapoints/Trend/Trend_KWH" or name
  const upper = absolutePath.toUpperCase();
  
  // Direct unit patterns
  if (upper.includes('KWH')) return 'kWh';
  if (upper.includes('KW') && !upper.includes('KWH')) return 'kW';
  if (upper.includes('AMP') || upper.includes('CURRENT')) return 'A';
  if (upper.includes('VOLT')) return 'V';
  if (upper.includes('HZ') || upper.includes('FREQ')) return 'Hz';
  if (upper.includes('PF') || upper.includes('POWER_FACTOR')) return 'PF';
  if (upper.includes('REACTIVE')) return 'kVAr';
  if (upper.includes('APPARENT')) return 'kVA';
  
  return null;
}

async function importTrendLogs(): Promise<void> {
  try {
    console.log('📊 Starting Trend Log Import Process...\n');
    
    // Read CSV files
    const logInfoPath = join(process.cwd(), 'exported-data', 'LogInfo.csv');
    const logItemInfoPath = join(process.cwd(), 'exported-data', 'LogItemInfo.csv');
    
    console.log('📖 Reading CSV files...');
    const logInfoContent = readFileSync(logInfoPath, 'utf-8');
    const logItemInfoContent = readFileSync(logItemInfoPath, 'utf-8');
    
    // Parse CSV
    const logInfoRecords = parse(logInfoContent, {
      columns: true,
      skip_empty_lines: true,
    }) as LogInfoRecord[];
    
    const logItemInfoRecords = parse(logItemInfoContent, {
      columns: true,
      skip_empty_lines: true,
    }) as LogItemInfoRecord[];
    
    console.log(`✅ Loaded ${logInfoRecords.length} trend logs`);
    console.log(`✅ Loaded ${logItemInfoRecords.length} trend log items\n`);
    
    // Filter for Trend Logs (Type = 3 for trending) and energy-related
    const trendLogs = logInfoRecords.filter(
      record => record.TableName && record.TableName.startsWith('TrendLog')
    );
    
    console.log(`📋 Found ${trendLogs.length} TrendLog tables\n`);
    
    // Find energy-related trend logs
    const energyTrendLogs: LogInfoRecord[] = [];
    const energyParameters: { [logId: string]: TrendLogItemData[] } = {};
    
    console.log('🔍 Scanning for energy-related parameters...\n');
    
    for (const trendLog of trendLogs) {
      const logId = trendLog.Id;
      
      // Get all items for this trend log
      const items = logItemInfoRecords.filter(item => item.LogId === logId);
      
      if (items.length === 0) continue;
      
      // Check if any items are energy-related
      const energyItems = items.filter(item => 
        isEnergyRelated(item.AbsolutePath) || 
        isEnergyRelated(item.Unit) ||
        isEnergyRelated(trendLog.AbsolutePath)
      );
      
      if (energyItems.length > 0 || isEnergyRelated(trendLog.AbsolutePath)) {
        energyTrendLogs.push(trendLog);
        energyParameters[logId] = energyItems.map(item => ({
          logId: parseInt(logId),
          itemId: item.ItemId ? parseInt(item.ItemId) : null,
          itemIndex: parseInt(item.ItemIndex),
          absolutePath: item.AbsolutePath,
          unit: item.Unit || extractUnit(item.AbsolutePath) || extractUnit(trendLog.AbsolutePath) || '',
          aggregationMode: item.AggregationMode ? parseInt(item.AggregationMode) : null,
          compression: item.Compression || null,
        }));
      }
    }
    
    console.log(`🎯 Found ${energyTrendLogs.length} ENERGY-RELATED trend logs\n`);
    console.log('=' .repeat(80));
    console.log('ENERGY METER TREND LOGS FOUND:');
    console.log('=' .repeat(80) + '\n');
    
    // Display results
    for (const trendLog of energyTrendLogs) {
      const logId = trendLog.Id;
      const items = energyParameters[logId] || [];
      
      console.log(`\n📌 Trend Log: ${trendLog.TableName}`);
      console.log(`   ID: ${logId}`);
      console.log(`   Source: ${trendLog.SourceName || 'N/A'}`);
      console.log(`   Path: ${trendLog.AbsolutePath}`);
      console.log(`   Records: ${trendLog.ServerRecCnt} (source: ${trendLog.SourceTotalCnt})`);
      console.log(`   Time Range: ${new Date(parseInt(trendLog.FirstTimestamp) * 1000).toISOString()} to ${new Date(parseInt(trendLog.LastTimestamp) * 1000).toISOString()}`);
      console.log(`   Items: ${items.length} parameters`);
      
      // Show unique units found
      const units = new Set(items.map(i => i.unit).filter(u => u));
      if (units.size > 0) {
        console.log(`   Units Found: ${Array.from(units).join(', ')}`);
      }
      
      // Show sample items
      console.log(`\n   Sample Parameters:`);
      items.slice(0, 5).forEach(item => {
        console.log(`     - Index ${item.itemIndex}: "${item.absolutePath}" [${item.unit || 'N/A'}]`);
      });
      
      if (items.length > 5) {
        console.log(`     ... and ${items.length - 5} more`);
      }
    }
    
    console.log('\n' + '=' .repeat(80));
    console.log('PARAMETER EXTRACTION SUMMARY:');
    console.log('=' .repeat(80) + '\n');
    
    // Extract all unique parameters by unit
    const parametersByUnit: { [unit: string]: string[] } = {};
    
    for (const items of Object.values(energyParameters)) {
      for (const item of items) {
        if (item.unit) {
          if (!parametersByUnit[item.unit]) {
            parametersByUnit[item.unit] = [];
          }
          if (!parametersByUnit[item.unit].includes(item.absolutePath)) {
            parametersByUnit[item.unit].push(item.absolutePath);
          }
        }
      }
    }
    
    console.log('Parameters by Unit Type:\n');
    
    const unitOrder = ['kWh', 'kW', 'A', 'V', 'Hz', 'PF', 'kVAr', 'kVA'];
    for (const unit of unitOrder) {
      if (parametersByUnit[unit]) {
        console.log(`📊 ${unit} (${parametersByUnit[unit].length} parameters)`);
        parametersByUnit[unit].slice(0, 3).forEach(path => {
          console.log(`   • ${path}`);
        });
        if (parametersByUnit[unit].length > 3) {
          console.log(`   ... and ${parametersByUnit[unit].length - 3} more`);
        }
        console.log();
      }
    }
    
    // Find other units
    const otherUnits = Object.keys(parametersByUnit).filter(u => !unitOrder.includes(u));
    if (otherUnits.length > 0) {
      console.log(`Other Units Found: ${otherUnits.join(', ')}\n`);
    }
    
    console.log('=' .repeat(80));
    console.log('✅ TREND LOG EXTRACTION COMPLETE');
    console.log('=' .repeat(80) + '\n');
    
    // Generate SQL for import (for reference)
    console.log('\n📝 Sample SQL Insert Statements (for reference):\n');
    
    let sqlInserts = '';
    for (const trendLog of energyTrendLogs.slice(0, 3)) {
      const logId = parseInt(trendLog.Id);
      sqlInserts += `INSERT INTO trend_logs (log_id, log_type, source_id, source_name, absolute_path, table_name, source_record_count, server_record_count, first_timestamp, last_timestamp, is_active) VALUES (${logId}, 3, ${trendLog.SourceId || 'NULL'}, '${trendLog.SourceName.replace(/'/g, "''")}', '${trendLog.AbsolutePath.replace(/'/g, "''")}', '${trendLog.TableName}', ${trendLog.SourceTotalCnt || 'NULL'}, ${trendLog.ServerRecCnt || 'NULL'}, ${trendLog.FirstTimestamp}, ${trendLog.LastTimestamp}, true);\n`;
    }
    
    console.log(sqlInserts);
    console.log('\n✨ Ready to sync with database! Next: Run the API endpoint /api/trend-logs/import-csv\n');
    
  } catch (error) {
    console.error('❌ Error importing trend logs:', error);
    process.exit(1);
  }
}

// Run directly
importTrendLogs().then(() => {
  console.log('🎉 Done!\n');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { importTrendLogs, TrendLogData, TrendLogItemData };
