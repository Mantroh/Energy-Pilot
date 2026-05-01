import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { RefreshCw, Database, AlertTriangle, Activity, Zap } from 'lucide-react';

interface BMSStatus {
  isInitialized: boolean;
  activeConnections: number;
  connectedSystems: string[];
  syncIntervals: string[];
}

interface BMSMeter {
  id: string;
  name: string;
  type: string;
  location: string;
  isOnline: boolean;
  lastSeen: Date;
  metadata?: {
    vendor?: string;
    system?: string;
    sourceConfigId?: string;
  };
}

interface BMSReading {
  meterId: string;
  timestamp: Date;
  parameters: {
    activePower: number;
    voltage: { L1: number; L2: number; L3: number; };
    current: { L1: number; L2: number; L3: number; };
    energy: number;
    frequency: number;
    powerFactor: number;
  };
}

interface BMSAlarm {
  id: string;
  meterId: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  isActive: boolean;
  timestamp: Date;
  acknowledgedAt?: Date;
  metadata?: {
    vendor?: string;
    system?: string;
  };
}

export function BMSIntegration() {
  const [status, setStatus] = useState<BMSStatus | null>(null);
  const [meters, setMeters] = useState<BMSMeter[]>([]);
  const [realtimeData, setRealtimeData] = useState<BMSReading[]>([]);
  const [alarms, setAlarms] = useState<BMSAlarm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('status');

  const fetchBMSData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch status
      const statusRes = await fetch('/api/bms/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }

      // Fetch meters
      const metersRes = await fetch('/api/bms/meters');
      if (metersRes.ok) {
        const metersData = await metersRes.json();
        setMeters(metersData);
      }

      // Fetch realtime data
      const realtimeRes = await fetch('/api/bms/realtime');
      if (realtimeRes.ok) {
        const realtimeData = await realtimeRes.json();
        setRealtimeData(realtimeData);
      }

      // Fetch alarms
      const alarmsRes = await fetch('/api/bms/alarms');
      if (alarmsRes.ok) {
        const alarmsData = await alarmsRes.json();
        setAlarms(alarmsData);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch BMS data');
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    try {
      const response = await fetch('/api/bms/sync', { method: 'POST' });
      if (response.ok) {
        // Refresh data after sync
        setTimeout(fetchBMSData, 1000);
      }
    } catch (err) {
      setError('Failed to trigger BMS sync');
    }
  };

  useEffect(() => {
    fetchBMSData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchBMSData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  const getVendorIcon = (vendor?: string) => {
    switch (vendor) {
      case 'schneider': return '🟢';
      case 'siemens': return '🔵';
      case 'abb': return '🟡';
      case 'file': return '📁';
      default: return '🏢';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Database className="h-6 w-6" />
          <h2 className="text-2xl font-bold">BMS Integration</h2>
        </div>
        <div className="flex space-x-2">
          <Button 
            onClick={fetchBMSData} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            onClick={triggerSync}
            disabled={loading}
            size="sm"
          >
            <Activity className="h-4 w-4 mr-2" />
            Sync Now
          </Button>
        </div>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="meters">Meters ({meters.length})</TabsTrigger>
          <TabsTrigger value="realtime">Real-time ({realtimeData.length})</TabsTrigger>
          <TabsTrigger value="alarms">Alarms ({alarms.filter(a => a.isActive).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {status?.isInitialized ? (
                    <Badge className="bg-green-500">Connected</Badge>
                  ) : (
                    <Badge variant="destructive">Disconnected</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{status?.activeConnections || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Meters</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{meters.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Alarms</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {alarms.filter(a => a.isActive).length}
                </div>
              </CardContent>
            </Card>
          </div>

          {status?.connectedSystems && status.connectedSystems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Connected Systems</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {status.connectedSystems.map((systemId) => (
                    <div key={systemId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="font-medium">{systemId}</span>
                      <Badge className="bg-green-500">Online</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="meters" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meters.map((meter) => (
              <Card key={meter.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {getVendorIcon(meter.metadata?.vendor)} {meter.name}
                    </CardTitle>
                    <Badge className={meter.isOnline ? 'bg-green-500' : 'bg-gray-500'}>
                      {meter.isOnline ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1 text-sm">
                    <p><strong>Type:</strong> {meter.type}</p>
                    <p><strong>Location:</strong> {meter.location}</p>
                    <p><strong>Last Seen:</strong> {new Date(meter.lastSeen).toLocaleString()}</p>
                    {meter.metadata?.vendor && (
                      <p><strong>Vendor:</strong> {meter.metadata.vendor}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="realtime" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {realtimeData.slice(0, 10).map((reading, index) => (
              <Card key={`${reading.meterId}-${index}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Meter {reading.meterId} - {new Date(reading.timestamp).toLocaleTimeString()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><strong>Power:</strong> {(reading.parameters?.activePower ?? 0).toFixed(1)} kW</div>
                    <div><strong>Energy:</strong> {(reading.parameters?.energy ?? 0).toFixed(1)} kWh</div>
                    <div><strong>Voltage L1:</strong> {(reading.parameters?.voltage?.L1 ?? 0).toFixed(1)} V</div>
                    <div><strong>Voltage L2:</strong> {(reading.parameters?.voltage?.L2 ?? 0).toFixed(1)} V</div>
                    <div><strong>Voltage L3:</strong> {(reading.parameters?.voltage?.L3 ?? 0).toFixed(1)} V</div>
                    <div><strong>Frequency:</strong> {(reading.parameters?.frequency ?? 50).toFixed(1)} Hz</div>
                    <div><strong>Power Factor:</strong> {(reading.parameters?.powerFactor ?? 0).toFixed(2)}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="alarms" className="space-y-4">
          <div className="space-y-3">
            {alarms.map((alarm) => (
              <Card key={alarm.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge className={getSeverityColor(alarm.severity)}>
                          {alarm.severity.toUpperCase()}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {getVendorIcon(alarm.metadata?.vendor)} Meter {alarm.meterId}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(alarm.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="font-medium">{alarm.message}</p>
                      {alarm.acknowledgedAt && (
                        <p className="text-sm text-gray-500 mt-1">
                          Acknowledged: {new Date(alarm.acknowledgedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <Badge className={alarm.isActive ? 'bg-red-500' : 'bg-gray-500'}>
                      {alarm.isActive ? 'Active' : 'Resolved'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}