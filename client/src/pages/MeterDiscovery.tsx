import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Zap, MapPin, Save, RefreshCw } from 'lucide-react';

interface Meter {
  tableName: string;
  friendlyName?: string;
  columnCount: number;
  columns: string[];
  readingCount: number;
  latestReading?: any;
  sampleReadings: any[];
  error?: string;
}

export default function MeterDiscovery() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchMeters();
  }, []);

  const fetchMeters = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/bms/discover-meters');
      if (!response.ok) throw new Error('Failed to fetch meters');
      const data = await response.json();
      setMeters(data.meters || []);
      
      // Load saved mappings
      const savedMappings = localStorage.getItem('meterMappings');
      if (savedMappings) {
        setMappings(JSON.parse(savedMappings));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const updateMeterName = (tableName: string, friendlyName: string) => {
    setMappings(prev => ({
      ...prev,
      [tableName]: friendlyName
    }));
  };

  const saveMappings = async () => {
    setSaving(true);
    try {
      // Save to localStorage
      localStorage.setItem('meterMappings', JSON.stringify(mappings));
      
      // Also save to backend
      const response = await fetch('/api/bms/meter-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappings)
      });
      
      if (!response.ok) throw new Error('Failed to save mappings');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const getMeterName = (tableName: string) => {
    return mappings[tableName] || tableName;
  };

  const getLatestValue = (reading: any, field: string) => {
    return reading?.[field] ?? 'N/A';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin">
          <Zap className="w-8 h-8 text-green-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Meter Discovery & Mapping</h1>
          <p className="text-gray-400 mt-2">
            Discover all energy meters in the METRO_BHAWAN database and assign friendly names
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={fetchMeters}
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={saveMappings}
            disabled={saving || Object.keys(mappings).length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Mappings'}
          </Button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {saved && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">
            ✓ Meter mappings saved successfully
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Meters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{meters.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Mapped</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {Object.keys(mappings).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Unmapped</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-500">
              {meters.length - Object.keys(mappings).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Meters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {meters.map(meter => (
          <Card key={meter.tableName} className="hover:border-green-500 transition-colors">
            <CardHeader>
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline" className="text-xs">
                  {meter.tableName}
                </Badge>
                {mappings[meter.tableName] && (
                  <Badge className="bg-green-600">Mapped</Badge>
                )}
              </div>
              <Input
                placeholder="Enter friendly name..."
                value={mappings[meter.tableName] || ''}
                onChange={(e) => updateMeterName(meter.tableName, e.target.value)}
                className="text-sm"
              />
            </CardHeader>
            <CardContent className="space-y-3">
              {meter.error ? (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">{meter.error}</AlertDescription>
                </Alert>
              ) : (
                <>
                  {/* Meter Stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">Readings:</span>
                      <div className="font-semibold">{meter.readingCount}</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Columns:</span>
                      <div className="font-semibold">{meter.columnCount}</div>
                    </div>
                  </div>

                  {/* Latest Reading */}
                  {meter.latestReading && (
                    <div className="bg-gray-900 rounded p-2 space-y-1 text-xs">
                      <div className="font-semibold text-green-400 mb-2">Latest Reading</div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Value:</span>
                        <span>{getLatestValue(meter.latestReading, 'Value')}</span>
                      </div>
                      {meter.latestReading.Timestamp && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Time:</span>
                          <span>{new Date(meter.latestReading.Timestamp).toLocaleTimeString()}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Available Columns */}
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Columns:</div>
                    <div className="flex flex-wrap gap-1">
                      {meter.columns.slice(0, 4).map(col => (
                        <Badge key={col} variant="secondary" className="text-xs">
                          {col}
                        </Badge>
                      ))}
                      {meter.columns.length > 4 && (
                        <Badge variant="secondary" className="text-xs">
                          +{meter.columns.length - 4} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Sample Data */}
                  {meter.sampleReadings.length > 0 && (
                    <div>
                      <div className="text-gray-400 text-xs mb-1">Sample Readings</div>
                      <div className="bg-gray-900 rounded p-2 text-xs max-h-24 overflow-y-auto">
                        {meter.sampleReadings.map((reading, idx) => (
                          <div key={idx} className="flex justify-between py-0.5">
                            <span className="text-gray-400">Value:</span>
                            <span>{reading.Value || 'N/A'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {meters.length === 0 && !error && (
        <Card className="text-center py-8">
          <AlertCircle className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
          <p className="text-gray-400">No meters found. Check database connection.</p>
        </Card>
      )}
    </div>
  );
}
