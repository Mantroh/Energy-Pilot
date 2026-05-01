import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Plus, 
  Edit, 
  Trash2, 
  TestTube,
  Database,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Monitor,
  HardDrive,
  Settings
} from "lucide-react";
import { BMSConnectionForm } from "@/components/BMSConnectionForm";
import { BMSFieldMapper } from "@/components/BMSFieldMapper";

interface BMSConnection {
  id: number;
  name: string;
  vendor: "schneider" | "siemens" | "abb" | "johnson_controls" | "file" | "custom";
  server: string;
  port: number;
  database: string;
  username: string;
  enableRealtime: boolean;
  intervalMinutes: number;
  isEnabled: boolean;
  connectionStatus: "connected" | "disconnected" | "error" | "testing";
  errorMessage?: string;
  lastSync?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const vendorIcons = {
  schneider: "🔋",
  siemens: "⚡",
  abb: "🏭", 
  johnson_controls: "🏢",
  loytec: "🌐",
  file: "📁",
  custom: "⚙️"
};

const vendorColors = {
  schneider: "bg-green-100 text-green-800",
  siemens: "bg-blue-100 text-blue-800",
  abb: "bg-orange-100 text-orange-800",
  johnson_controls: "bg-purple-100 text-purple-800",
  loytec: "bg-red-100 text-red-800",
  file: "bg-gray-100 text-gray-800",
  custom: "bg-indigo-100 text-indigo-800"
};

export function BMSManagement() {
  const [connections, setConnections] = useState<BMSConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<BMSConnection | null>(null);
  const [testingConnection, setTestingConnection] = useState<number | null>(null);

  // Fetch connections
  const fetchConnections = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/bms/connections');
      if (!response.ok) throw new Error('Failed to fetch connections');
      
      const data = await response.json();
      setConnections(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  // Test connection
  const handleTestConnection = async (id: number) => {
    try {
      setTestingConnection(id);
      const response = await fetch(`/api/bms/connections/${id}/test`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh connections to get updated status
        await fetchConnections();
        alert('Connection test successful!');
      } else {
        alert(`Connection test failed: ${result.message}`);
      }
    } catch (err) {
      alert(`Connection test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setTestingConnection(null);
    }
  };

  // Delete connection
  const handleDeleteConnection = async (id: number) => {
    if (!confirm('Are you sure you want to delete this BMS connection?')) return;

    try {
      const response = await fetch(`/api/bms/connections/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete connection');

      await fetchConnections();
    } catch (err) {
      alert(`Failed to delete connection: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'testing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <WifiOff className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string, enabled: boolean) => {
    if (!enabled) {
      return <Badge variant="secondary">Disabled</Badge>;
    }

    switch (status) {
      case 'connected':
        return <Badge className="bg-green-100 text-green-800">Connected</Badge>;
      case 'testing':
        return <Badge className="bg-blue-100 text-blue-800">Testing</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Disconnected</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading BMS connections...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">BMS Management</h1>
              <p className="text-gray-600 mt-2">
                Manage Building Management System connections and data integration
              </p>
            </div>
            <Button 
              onClick={() => setShowAddDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add BMS Connection
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {connections.length === 0 ? (
            <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Database className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No BMS Connections
              </h3>
              <p className="text-gray-600 mb-6">
                Get started by adding your first Building Management System connection
              </p>
              <Button 
                onClick={() => setShowAddDialog(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add BMS Connection
              </Button>
            </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>BMS Connections ({connections.length})</CardTitle>
                <CardDescription>
                  Manage your Building Management System database connections and monitoring
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Database</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((connection) => (
                  <TableRow key={connection.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        {getStatusIcon(connection.connectionStatus)}
                        <span className="ml-2">{connection.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={vendorColors[connection.vendor]}>
                        {vendorIcons[connection.vendor]} {connection.vendor}
                      </Badge>
                    </TableCell>
                    <TableCell>{connection.server}:{connection.port}</TableCell>
                    <TableCell>{connection.database}</TableCell>
                    <TableCell>
                      {getStatusBadge(connection.connectionStatus, connection.isEnabled)}
                    </TableCell>
                    <TableCell>
                      {connection.lastSync 
                        ? new Date(connection.lastSync).toLocaleString()
                        : 'Never'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTestConnection(connection.id)}
                          disabled={testingConnection === connection.id}
                        >
                          {testingConnection === connection.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost" 
                          size="sm"
                          onClick={() => setEditingConnection(connection)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteConnection(connection.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add Connection Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add BMS Connection</DialogTitle>
            <DialogDescription>
              Connect to a Building Management System database for real-time energy monitoring
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <BMSConnectionForm 
            onSubmit={async (data) => {
              try {
                const response = await fetch('/api/bms/connections', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data)
                });

                if (!response.ok) throw new Error('Failed to create connection');

                await fetchConnections();
                setShowAddDialog(false);
              } catch (err) {
                alert(`Failed to create connection: ${err instanceof Error ? err.message : 'Unknown error'}`);
              }
            }}
            onCancel={() => setShowAddDialog(false)}
          />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Connection Dialog */}
      <Dialog 
        open={editingConnection !== null} 
        onOpenChange={() => setEditingConnection(null)}
      >
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit BMS Connection</DialogTitle>
            <DialogDescription>
              Modify connection settings and field mappings
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {editingConnection && (
              <Tabs defaultValue="connection" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="connection">
                  <Settings className="h-4 w-4 mr-2" />
                  Connection
                </TabsTrigger>
                <TabsTrigger value="mappings">
                  <Monitor className="h-4 w-4 mr-2" />
                  Field Mappings
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="connection">
                <BMSConnectionForm 
                  initialData={editingConnection}
                  onSubmit={async (data) => {
                    try {
                      const response = await fetch(`/api/bms/connections/${editingConnection.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                      });

                      if (!response.ok) throw new Error('Failed to update connection');

                      await fetchConnections();
                      setEditingConnection(null);
                    } catch (err) {
                      alert(`Failed to update connection: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    }
                  }}
                  onCancel={() => setEditingConnection(null)}
                />
              </TabsContent>
              
              <TabsContent value="mappings">
                <BMSFieldMapper 
                  connection={editingConnection}
                  onSave={async (mappings) => {
                    try {
                      const response = await fetch(`/api/bms/connections/${editingConnection.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fieldMappings: mappings })
                      });

                      if (!response.ok) throw new Error('Failed to update field mappings');

                      await fetchConnections();
                      alert('Field mappings updated successfully!');
                    } catch (err) {
                      alert(`Failed to update field mappings: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    }
                  }}
                />
              </TabsContent>
            </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}