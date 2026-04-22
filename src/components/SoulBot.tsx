import React, { useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { BrainCircuit, ArrowDownToLine, Cpu, ArrowUpFromLine, Database } from 'lucide-react';

export default function SoulBot() {
  const { processLogs, isEngineRunning } = useAppContext();
  const logsEndRef = useRef<HTMLDivElement>(null);

  const soulLogs = processLogs.filter(log => log.bot === 'soul');

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [soulLogs]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'receive': return <ArrowDownToLine className="w-4 h-4 text-blue-400" />;
      case 'process': return <Cpu className="w-4 h-4 text-yellow-400" />;
      case 'send': return <ArrowUpFromLine className="w-4 h-4 text-green-400" />;
      case 'memory_index': return <Database className="w-4 h-4 text-purple-400" />;
      default: return <BrainCircuit className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="p-4 bg-gray-950 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <BrainCircuit className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Soul Bot Process Monitor</h2>
            <p className="text-gray-400 text-xs">
              Status: {isEngineRunning ? <span className="text-green-400">Listening to Telegram...</span> : <span className="text-red-400">Offline</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a0a0a]">
        {soulLogs.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <BrainCircuit className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No processes logged yet.</p>
            <p className="text-sm mt-2">Start the AI Engine and send a message to your Soul Bot on Telegram.</p>
          </div>
        ) : (
          soulLogs.map(log => (
            <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-900 border border-gray-800 font-mono text-sm">
              <div className="mt-0.5 shrink-0">
                {getIcon(log.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-500 text-xs">
                    [{new Date(log.timestamp).toLocaleTimeString()}] {log.type.toUpperCase()}
                  </span>
                </div>
                <p className={`whitespace-pre-wrap break-words ${
                  log.type === 'receive' ? 'text-blue-200' :
                  log.type === 'send' ? 'text-green-200' :
                  log.type === 'memory_index' ? 'text-purple-300' :
                  'text-gray-300'
                }`}>
                  {log.content}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
