/**
 * Trend Log Import Routes
 * Handles CSV import and trend log API endpoints
 */

import type { Express } from "express";
import { storage } from "./storage";

export function registerTrendLogRoutes(app: Express): void {
  // Import trend logs from CSV
  app.post("/api/trend-logs/import-csv", async (req, res) => {
    try {
      console.log('🚀 Starting trend log import from CSV...');
      
      const result = await (storage as any).importTrendLogsFromCSV();
      
      res.json({
        success: true,
        message: `Imported ${result.trendLogCount} trend logs with ${result.itemCount} parameters`,
        ...result
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

  // Get all trend logs
  app.get("/api/trend-logs", async (req, res) => {
    try {
      const trendLogs = await (storage as any).getTrendLogs();
      res.json({
        success: true,
        count: trendLogs.length,
        data: trendLogs
      });
    } catch (error: any) {
      console.error('❌ Error fetching trend logs:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch trend logs",
        error: error.message
      });
    }
  });

  // Get trend log items by log ID
  app.get("/api/trend-logs/:logId/items", async (req, res) => {
    try {
      const logId = parseInt(req.params.logId);
      const items = await (storage as any).getTrendLogItems(logId);
      
      // Group by unit for easy display
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
      console.error('❌ Error fetching trend log items:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch trend log items",
        error: error.message
      });
    }
  });

  // Link meter to trend log
  app.post("/api/meters/:meterId/trend-logs/:trendLogId", async (req, res) => {
    try {
      const meterId = parseInt(req.params.meterId);
      const trendLogId = parseInt(req.params.trendLogId);
      const { friendlyName } = req.body;
      
      const mapping = await (storage as any).linkMeterToTrendLog(meterId, trendLogId, friendlyName);
      
      res.json({
        success: true,
        message: "Meter linked to trend log",
        data: mapping
      });
    } catch (error: any) {
      console.error('❌ Error linking meter to trend log:', error);
      res.status(500).json({
        success: false,
        message: "Failed to link meter to trend log",
        error: error.message
      });
    }
  });

  // Get meter trend logs with parameters
  app.get("/api/meters/:meterId/trend-logs", async (req, res) => {
    try {
      const meterId = parseInt(req.params.meterId);
      const mappings = await (storage as any).getMeterTrendLogs(meterId);
      
      // Prepare response with parameter info
      const data = mappings.map((m: any) => ({
        ...m,
        parameters: m.items?.map((i: any) => ({
          index: i.itemIndex,
          name: i.absolutePath,
          unit: i.unit,
          path: i.absolutePath
        })) || []
      }));
      
      res.json({
        success: true,
        meterId,
        count: mappings.length,
        data
      });
    } catch (error: any) {
      console.error('❌ Error fetching meter trend logs:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch meter trend logs",
        error: error.message
      });
    }
  });

  console.log('✅ Trend Log routes registered');
}
