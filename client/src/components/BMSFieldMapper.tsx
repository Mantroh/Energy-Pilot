import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Save,
  RotateCcw,
  Database,
  Zap,
  AlertTriangle,
  InfoIcon
} from "lucide-react";

interface BMSFieldMapperProps {
  connection: any;
  onSave: (mappings: any) => Promise<void>;
}

const defaultMappings = {
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

export function BMSFieldMapper({ connection, onSave }: BMSFieldMapperProps) {
  const [mappings, setMappings] = useState(
    connection.fieldMappings || defaultMappings[connection.vendor] || defaultMappings.custom
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleFieldChange = (section: string, field: string, value: string, subField?: string) => {
    setMappings((prev: any) => {
      const updated = { ...prev };
      if (subField) {
        if (!updated[section][field]) updated[section][field] = {};
        updated[section][field][subField] = value;
      } else {
        updated[section][field] = value;
      }
      return updated;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSave(mappings);
      setHasChanges(false);
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    const defaults = defaultMappings[connection.vendor as keyof typeof defaultMappings] || defaultMappings.custom;
    setMappings(defaults);
    setHasChanges(true);
  };

  const renderField = (
    section: string,
    field: string,
    label: string,
    description?: string,
    subFields?: { [key: string]: string }
  ) => {
    // Ensure section exists in mappings
    if (!mappings[section]) {
      return null;
    }

    if (subFields) {
      return (
        <div key={field} className="space-y-3">
          <div>
            <Label className="text-sm font-medium">{label}</Label>
            {description && <p className="text-xs text-gray-600 mt-1">{description}</p>}
          </div>
          <div className="grid grid-cols-1 gap-2 ml-4">
            {Object.entries(subFields).map(([subField, subLabel]) => (
              <div key={subField} className="grid grid-cols-2 gap-2 items-center">
                <Label className="text-sm">{subLabel}:</Label>
                <Input
                  value={mappings[section][field]?.[subField] || ''}
                  onChange={(e) => handleFieldChange(section, field, e.target.value, subField)}
                  placeholder={`${subLabel.toLowerCase()}_column`}
                  className="text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key={field} className="grid grid-cols-2 gap-4 items-center">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {description && <p className="text-xs text-gray-600 mt-1">{description}</p>}
        </div>
        <Input
          value={mappings[section][field] || ''}
          onChange={(e) => handleFieldChange(section, field, e.target.value)}
          placeholder={`${label.toLowerCase().replace(/\s+/g, '_')}_column`}
          className="text-sm"
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Field Mappings</h3>
          <p className="text-sm text-gray-600">
            Map BMS database columns to Energy Pilot data fields
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={resetToDefaults}
            className="text-sm"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Mappings'}
          </Button>
        </div>
      </div>

      {/* Vendor Info */}
      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>
          <strong>{connection.vendor.toUpperCase()} Connection:</strong> 
          {' '}Map the column names from your {connection.vendor} database tables to Energy Pilot's data structure.
          Leave fields empty if they don't exist in your database.
        </AlertDescription>
      </Alert>

      {/* Field Mapping Tabs */}
      <Tabs defaultValue="meters" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="meters">
            <Database className="h-4 w-4 mr-2" />
            Meters
          </TabsTrigger>
          <TabsTrigger value="readings">
            <Zap className="h-4 w-4 mr-2" />
            Readings
          </TabsTrigger>
          <TabsTrigger value="alarms">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Alarms
          </TabsTrigger>
        </TabsList>

        {/* Meters Tab */}
        <TabsContent value="meters">
          <Card>
            <CardHeader>
              <CardTitle>Meter/Device Information</CardTitle>
              <CardDescription>
                Map database columns that contain meter and device information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderField("meters", "id", "Device ID", "Unique identifier for each meter/device")}
              {renderField("meters", "name", "Device Name", "Human-readable name or label")}
              {renderField("meters", "type", "Device Type", "Type or category of device")}
              {renderField("meters", "location", "Location", "Physical location or description")}
              {renderField("meters", "isOnline", "Online Status", "Boolean field indicating if device is online")}
              {renderField("meters", "lastSeen", "Last Communication", "Timestamp of last communication")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Readings Tab */}
        <TabsContent value="readings">
          <Card>
            <CardHeader>
              <CardTitle>Energy Readings</CardTitle>
              <CardDescription>
                Map database columns that contain energy measurement data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderField("readings", "meterId", "Meter ID", "Foreign key linking to meter/device")}
              {renderField("readings", "timestamp", "Timestamp", "When the reading was taken")}
              {renderField("readings", "activePower", "Active Power (kW)", "Total active power in kilowatts")}
              
              <Separator className="my-4" />
              
              {renderField("readings", "voltage", "Voltage (V)", "Phase voltages", {
                L1: "L1/Phase 1",
                L2: "L2/Phase 2", 
                L3: "L3/Phase 3"
              })}
              
              <Separator className="my-4" />
              
              {renderField("readings", "current", "Current (A)", "Phase currents", {
                L1: "L1/Phase 1",
                L2: "L2/Phase 2",
                L3: "L3/Phase 3"
              })}
              
              <Separator className="my-4" />
              
              {renderField("readings", "energy", "Total Energy (kWh)", "Cumulative energy consumption")}
              {renderField("readings", "frequency", "Frequency (Hz)", "System frequency")}
              {renderField("readings", "powerFactor", "Power Factor", "Power factor (0-1 or percentage)")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alarms Tab */}
        <TabsContent value="alarms">
          <Card>
            <CardHeader>
              <CardTitle>Alarm Information</CardTitle>
              <CardDescription>
                Map database columns that contain alarm and alert data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderField("alarms", "id", "Alarm ID", "Unique identifier for each alarm")}
              {renderField("alarms", "meterId", "Meter ID", "Foreign key linking alarm to meter/device")}
              {renderField("alarms", "message", "Alarm Message", "Description or text of the alarm")}
              {renderField("alarms", "severity", "Severity Level", "Priority or severity (low/medium/high)")}
              {renderField("alarms", "isActive", "Active Status", "Boolean indicating if alarm is currently active")}
              {renderField("alarms", "timestamp", "Alarm Timestamp", "When the alarm was triggered")}
              {renderField("alarms", "acknowledgedAt", "Acknowledged Timestamp", "When the alarm was acknowledged")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Status */}
      {hasChanges && (
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Click "Save Mappings" to apply your field mapping updates.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}