# METER DISCOVERY FEATURE ASSESSMENT REPORT

## Executive Summary

The Energy-Pilot application has a **partially implemented meter discovery system**. The foundation is solid but critical features are missing, particularly:

1. **Real-time deletion reflection** - ❌ Not synced across pages
2. **Trend Log parameter extraction** - ❌ No API to map trend logs to meters/parameters  
3. **Parameter metadata** - ❌ Trend log columns not extracted or linked

---

## Current State Analysis

### ✅ Working Features

#### 1. Meter Discovery from Database
- **File**: [client/src/pages/MeterDiscovery.tsx](client/src/pages/MeterDiscovery.tsx)
- **Functionality**:
  - Discovers tables from METRO_BHAWAN BMS database
  - Allows users to assign friendly names to meters
  - Stores mappings in localStorage and backend
  - Displays mapped/unmapped meter counts
  
#### 2. Meter Management & Display
- **File**: [client/src/pages/Meters.tsx](client/src/pages/Meters.tsx)
- **Functionality**:
  - Lists all energy meters from database
  - Shows real-time readings: power, voltage, current, energy, frequency, power factor
  - 5-second auto-refresh for meter list
  - 2-second refresh for readings
  - Fetches BACnet parameters for each meter

#### 3. Deletion Routes
- **Endpoints**:
  - `DELETE /api/bacnet/devices/:deviceId` - Deletes device and associated data
  - `POST /api/modbus/delete-discovered-meters` - Removes from discovery file
  
#### 4. Database Schema
- **devices table** - Meter information
- **readings table** - Time-series meter data
- **bacnetObjectMappings table** - BACnet parameter definitions
- **bacnetControllers table** - BACnet controller info

---

### ❌ Missing Features

#### 1. Real-Time Deletion Synchronization
**Issue**: When a meter is deleted, other pages don't auto-refresh
- **Root Cause**: No event broadcast/notification system
- **Impact**: Users must manually refresh to see deleted meters removed
- **Solution Needed**: 
  - WebSocket or Server-Sent Events (SSE) for real-time updates
  - Query client invalidation on deletion
  - Or periodic polling with shorter intervals

#### 2. Trend Log Parameter Extraction (CRITICAL)
**Issue**: Trend logs exist but parameters are not extracted or mapped
- **Data Available**:
  - `exported-data/trendlog_readings.csv` - Raw trend data (130MB+)
  - `exported-data/LogInfo.csv` - Trend log metadata
  - `exported-data/LogItemInfo.csv` - Parameter definitions
  
- **Current State**: These CSVs are not parsed or used in the app
  
- **Missing API Endpoints**:
  ```
  GET /api/trend-logs/structure           # Get column definitions
  GET /api/trend-logs/:logId/parameters   # Get params for a trend log
  GET /api/meters/:meterId/trend-logs     # Link meter to trend logs
  POST /api/trend-logs/import-structure   # Parse and store CSV metadata
  ```

#### 3. Meter-to-Trend Log Linking
**Issue**: No association between meters and their trend logs
- **Current**: Meters are discovered from BACnet objects
- **Missing**: Mapping table to link meter → LogId → parameters
- **Needed**: `meter_trend_log_mappings` table in database

#### 4. Parameter Metadata Storage
**Issue**: Parameter units, types, and names are not stored
- **Available in CSV**: AbsolutePath, Unit, AggregationMode
- **Not Used**: Units like "kWh", "kW", "A", "V" are lost
- **Needed**: Parse and store parameter metadata

---

## Trend Log Structure (From CSV Analysis)

### trendlog_readings.csv
```csv
SourceTable,LogId,SeqNum,RecordType,ItemIndex,Value,Timestamp
TrendLog_00000001,93506,195154,2,0,39813008,1770471184
TrendLog_00000001,93352,221949,2,0,4.71049,1770471166
```
- **SourceTable**: Which trend log this came from
- **LogId**: Numeric ID for the trend log
- **ItemIndex**: Which parameter in the trend log
- **Value**: The actual reading
- **Timestamp**: Unix timestamp

### LogItemInfo.csv (Parameter Definitions)
```csv
LogId,ItemId,ItemIndex,AbsolutePath,Unit,AggregationMode,Compression
68,63,0,"System/Alarming/LWEB-900 Alarm Server","",0,""
```
- **LogId**: References trendlog_readings.LogId
- **ItemIndex**: Maps to ItemIndex in trendlog_readings
- **AbsolutePath**: Meter path like "Datapoints/Trend/2F_AHU_RAT"
- **Unit**: "kW", "kWh", "A", "V", etc.

### LogInfo.csv (Trend Log Metadata)
```csv
Id,Type,SourceId,SourceName,AbsolutePath,SourceTotalCnt,ServerTotalCnt,ServerRecCnt,FirstTimestamp,LastTimestamp,TableName
75827,1,24639,"DDC24","Datapoints/Trend/Trend_KWH",7,14852,14852,1747852635,1767377484,"TrendLog_00000008"
```
- **Id**: LogId that references LogItemInfo
- **SourceName**: Human-readable name
- **TableName**: SQL table name (TrendLog_00000008)
- **AbsolutePath**: Full path to parameter

---

## Key Data Points Found

**Energy Meter Trend Log**:
- LogId: 75827
- Source: DDC24 device
- Path: "Datapoints/Trend/Trend_KWH"
- TableName: TrendLog_00000008
- 14,852 records with 7 items each

---

## Implementation Roadmap

### Phase 1: Add Trend Log Support (1-2 Days)
1. Create schema tables:
   ```typescript
   - trend_logs: { id, logId, sourceId, sourceName, tableName, path }
   - trend_log_items: { id, logId, itemId, itemIndex, path, unit }
   - meter_trend_mappings: { meterId, trendLogId, linkedAt }
   ```

2. Add import API:
   ```typescript
   POST /api/trend-logs/import-csv
   - Parses LogInfo.csv and LogItemInfo.csv
   - Stores structure in database
   - Maps existing meters to trend logs
   ```

3. Add query APIs:
   ```typescript
   GET /api/trend-logs/list
   GET /api/meters/:id/trend-parameters
   GET /api/trend-logs/:id/readings?hours=24
   ```

### Phase 2: Real-Time Sync (1 Day)
1. Add WebSocket events for meter changes
2. Invalidate React Query caches on deletion
3. Implement auto-refresh subscription

### Phase 3: UI Updates (1 Day)
1. Show trend log parameters in Meters page
2. Add parameter cards with units
3. Link to historical trend data

---

## Files to Modify

1. **Database Schema**
   - [shared/schema.ts](shared/schema.ts) - Add trend log tables

2. **Backend Routes**
   - [server/routes.ts](server/routes.ts) - Add trend log endpoints

3. **Backend Storage**
   - [server/storage.ts](server/storage.ts) - Add trend log queries

4. **Client Pages**
   - [client/src/pages/Meters.tsx](client/src/pages/Meters.tsx) - Show parameters
   - [client/src/pages/MeterDiscovery.tsx](client/src/pages/MeterDiscovery.tsx) - Link to trend logs

---

## Next Steps

Ready to implement:
1. ✅ Trend log schema tables
2. ✅ CSV import logic 
3. ✅ API endpoints for parameter fetching
4. ✅ UI to display meter parameters with units
5. ✅ Real-time deletion sync (optional/advanced)

Would you like me to proceed with implementing these features?

