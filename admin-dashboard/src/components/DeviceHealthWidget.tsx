import { useEffect, useState } from "react";
import { Battery, BatteryCharging, Smartphone, Wifi, WifiOff } from "lucide-react";

export function DeviceHealthWidget({ operatorId }: { operatorId: string }) {
  const [device, setDevice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const API_URL = import.meta.env.VITE_ADMIN_API_URL || "http://localhost:5050";

  useEffect(() => {
    const fetchDeviceStatus = async () => {
      try {
        const token = localStorage.getItem("supabase.auth.token");
        const parsedToken = token ? JSON.parse(token) : null;
        const jwt = parsedToken?.currentSession?.access_token;

        const res = await fetch(`${API_URL}/api/devices/status?operator_id=${operatorId}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            setDevice(data[0]); // Just pick the first device for the dashboard
          }
        }
      } catch (err) {
        console.error("Failed to fetch device status", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDeviceStatus();
    const interval = setInterval(fetchDeviceStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [operatorId]);

  if (loading) {
    return <div className="p-4 bg-gray-900 rounded-xl animate-pulse h-32"></div>;
  }

  if (!device) {
    return (
      <div className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-gray-700/50 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
          <Smartphone className="w-6 h-6 text-blue-400" />
        </div>
        <h3 className="text-white font-medium mb-1">No Worker Device Paired</h3>
        <p className="text-sm text-gray-400 mb-4">Pair an Android device to start processing bundles automatically.</p>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
          Pair Device Now
        </button>
      </div>
    );
  }

  const isOnline = device.is_online;
  const lastSeen = new Date(device.last_ping_at);
  const diffMinutes = Math.floor((new Date().getTime() - lastSeen.getTime()) / 60000);
  const isActuallyOnline = isOnline && diffMinutes < 2; // Considered offline if no ping in 2 mins

  return (
    <div className="p-5 bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-gray-700/50 shadow-lg relative overflow-hidden group">
      {/* Decorative background glow */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 transition-all duration-1000 ${isActuallyOnline ? 'bg-green-500' : 'bg-red-500'}`} />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${isActuallyOnline ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">{device.device_name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full animate-pulse ${isActuallyOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-xs text-gray-400">
                {isActuallyOnline ? 'Online & Ready' : `Offline (Last seen ${diffMinutes}m ago)`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 relative z-10">
        {/* Battery Stat */}
        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Battery</span>
            {device.battery_level < 20 ? (
              <Battery className="w-4 h-4 text-red-400" />
            ) : device.battery_level === 100 ? (
              <BatteryCharging className="w-4 h-4 text-green-400" />
            ) : (
              <Battery className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold ${device.battery_level < 20 ? 'text-red-400' : 'text-white'}`}>
              {device.battery_level}%
            </span>
          </div>
        </div>

        {/* Network Stat */}
        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Network</span>
            {isActuallyOnline ? (
              <Wifi className="w-4 h-4 text-blue-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-gray-500" />
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-white capitalize">
              {device.network_type || 'Unknown'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
