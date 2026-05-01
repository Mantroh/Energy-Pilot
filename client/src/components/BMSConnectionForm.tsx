import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, Eye, EyeOff } from "lucide-react";

interface BMSConnectionFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

const vendors = [
  { value: "schneider", label: "Schneider Electric", description: "PowerLogic, EcoStruxure systems" },
  { value: "siemens", label: "Siemens", description: "DESIGO, Navigator systems" },
  { value: "abb", label: "ABB", description: "Ability System 800xA, Symphony Plus" },
  { value: "johnson_controls", label: "Johnson Controls", description: "Metasys, FX series" },
  { value: "loytec", label: "Loytec", description: "BACnet/IP, NXL-series systems" },
  { value: "file", label: "File-based", description: "CSV, Excel files" },
  { value: "custom", label: "Custom Database", description: "Generic SQL Server database" }
];

export function BMSConnectionForm({ initialData, onSubmit, onCancel }: BMSConnectionFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    vendor: initialData?.vendor || 'custom',
    server: initialData?.server || '',
    port: initialData?.port || 1433,
    database: initialData?.database || '',
    username: initialData?.username || '',
    password: initialData?.password || '',
    trustServerCertificate: initialData?.trustServerCertificate ?? true,
    encrypt: initialData?.encrypt ?? false,
    enableArithAbort: initialData?.enableArithAbort ?? true,
    enableRealtime: initialData?.enableRealtime ?? true,
    intervalMinutes: initialData?.intervalMinutes || 5,
    isEnabled: initialData?.isEnabled ?? true,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.server.trim()) newErrors.server = 'Server is required';
    if (!formData.database.trim()) newErrors.database = 'Database is required';
    if (!formData.username.trim()) newErrors.username = 'Username is required';
    // Password is optional - some systems use Windows auth or other authentication methods
    
    if (formData.port < 1 || formData.port > 65535) {
      newErrors.port = 'Port must be between 1 and 65535';
    }
    
    if (formData.intervalMinutes < 1 || formData.intervalMinutes > 60) {
      newErrors.intervalMinutes = 'Interval must be between 1 and 60 minutes';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      
      // For updates, only include password if it's changed
      const submitData = { ...formData };
      if (initialData && !formData.password.trim()) {
        delete submitData.password;
      }
      
      await onSubmit(submitData);
    } catch (error) {
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateFormData = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  const selectedVendor = vendors.find(v => v.value === formData.vendor);

  return (
    <div className="w-full max-w-none max-h-[75vh] overflow-y-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Connection Details</CardTitle>
            <CardDescription className="text-sm">
              Basic information about this BMS connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Connection Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                placeholder="Main Building BMS"
              />
              {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor *</Label>
              <Select value={formData.vendor} onValueChange={(value) => updateFormData('vendor', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.value} value={vendor.value}>
                      <div>
                        <div className="font-medium">{vendor.label}</div>
                        <div className="text-sm text-gray-600">{vendor.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedVendor && (
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertDescription>
                <strong>{selectedVendor.label}:</strong> {selectedVendor.description}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Database Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Database Configuration</CardTitle>
          <CardDescription className="text-sm">
            Connection details for the BMS database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="col-span-1 lg:col-span-2 space-y-2">
              <Label htmlFor="server">Server *</Label>
              <Input
                id="server"
                value={formData.server}
                onChange={(e) => updateFormData('server', e.target.value)}
                placeholder="localhost or IP address"
              />
              {errors.server && <p className="text-sm text-red-600">{errors.server}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={formData.port}
                onChange={(e) => updateFormData('port', parseInt(e.target.value))}
                placeholder="1433"
              />
              {errors.port && <p className="text-sm text-red-600">{errors.port}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="database">Database Name *</Label>
            <Input
              id="database"
              value={formData.database}
              onChange={(e) => updateFormData('database', e.target.value)}
              placeholder="EnergyManagement"
            />
            {errors.database && <p className="text-sm text-red-600">{errors.database}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => updateFormData('username', e.target.value)}
                placeholder="bms_readonly"
              />
              {errors.username && <p className="text-sm text-red-600">{errors.username}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Password
                {initialData && <span className="text-sm text-gray-500">(leave blank to keep current)</span>}
                {!initialData && <span className="text-sm text-gray-500">(optional)</span>}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => updateFormData('password', e.target.value)}
                  placeholder={initialData ? "••••••••" : "Leave blank for Windows auth"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {errors.password && <p className="text-sm text-red-600">{errors.password}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Connection Options</CardTitle>
          <CardDescription className="text-sm">
            Advanced database connection settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex items-center space-x-2">
              <Switch
                id="trustServerCertificate"
                checked={formData.trustServerCertificate}
                onCheckedChange={(checked) => updateFormData('trustServerCertificate', checked)}
              />
              <Label htmlFor="trustServerCertificate">Trust Server Certificate</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="encrypt"
                checked={formData.encrypt}
                onCheckedChange={(checked) => updateFormData('encrypt', checked)}
              />
              <Label htmlFor="encrypt">Encrypt Connection</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="enableArithAbort"
                checked={formData.enableArithAbort}
                onCheckedChange={(checked) => updateFormData('enableArithAbort', checked)}
              />
              <Label htmlFor="enableArithAbort">Enable ARITHABORT</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isEnabled"
                checked={formData.isEnabled}
                onCheckedChange={(checked) => updateFormData('isEnabled', checked)}
              />
              <Label htmlFor="isEnabled">Enable Connection</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Synchronization Settings</CardTitle>
          <CardDescription className="text-sm">
            Configure how often data is synchronized from the BMS
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="enableRealtime"
                checked={formData.enableRealtime}
                onCheckedChange={(checked) => updateFormData('enableRealtime', checked)}
              />
              <Label htmlFor="enableRealtime">Enable Real-time Sync</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="intervalMinutes">Sync Interval (minutes)</Label>
              <Input
                id="intervalMinutes"
                type="number"
                min="1"
                max="60"
                value={formData.intervalMinutes}
                onChange={(e) => updateFormData('intervalMinutes', parseInt(e.target.value))}
                disabled={!formData.enableRealtime}
              />
              {errors.intervalMinutes && <p className="text-sm text-red-600">{errors.intervalMinutes}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-4 pt-6 border-t">
        <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              {initialData ? 'Updating...' : 'Creating...'}
            </>
          ) : (
            initialData ? 'Update Connection' : 'Create Connection'
          )}
        </Button>
      </div>
      </form>
    </div>
  );
}