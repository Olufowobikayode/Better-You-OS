import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Activity, Clock } from 'lucide-react';

export default function PingService() {
  const { apiKeys } = useAppContext();
  const [lastPing, setLastPing] = useState<number | null>(null);
  const [pingCount, setPingCount] = useState(0);

  useEffect(() => {
    // Ping every 5 minutes (300,000 ms)
    const PING_INTERVAL = 5 * 60 * 1000;
    
    const performPing = async () => {
      try {
        // Ping current origin
        await fetch(window.location.origin + '/?ping=' + Date.now(), { mode: 'no-cors', cache: 'no-store' });
        
        // If user provided a specific Render URL, ping that too
        if (apiKeys.renderUrl) {
           await fetch(apiKeys.renderUrl + '/?keepalive=' + Date.now(), { mode: 'no-cors', cache: 'no-store' });
        }
        
        setLastPing(Date.now());
        setPingCount(prev => prev + 1);
        console.log(`[Ping Service] Keep-alive ping sent at ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        console.warn("[Ping Service] Local ping failed, but this is normal for no-cors/origin checks.", e);
      }
    };

    // Initial ping
    performPing();

    const interval = setInterval(performPing, PING_INTERVAL);
    return () => clearInterval(interval);
  }, [apiKeys.renderUrl]);

  if (pingCount === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 bg-gray-900/80 backdrop-blur-md border border-gray-800 px-4 py-2 rounded-full shadow-2xl pointer-events-none transition-all animate-pulse">
      <div className="flex -space-x-1">
        <Activity className="w-4 h-4 text-green-500 animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter leading-none">Keep-Alive Active</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-blue-400" />
          <span className="text-[10px] font-mono text-blue-300">
            {lastPing ? new Date(lastPing).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
          </span>
          <span className="text-[8px] text-gray-500 ml-1">({pingCount} pings)</span>
        </div>
      </div>
    </div>
  );
}
