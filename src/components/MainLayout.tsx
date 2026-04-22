import React, { useState } from 'react';
import { Settings, Terminal, BrainCircuit, Globe, Database, Menu, X, Power, Image as ImageIcon } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import Setup from './Setup';
import SystemPrompt from './SystemPrompt';
import SoulBot from './SoulBot';
import PublicBot from './PublicBot';
import MemoryCore from './MemoryCore';
import Multimedia from './Multimedia';
import TelegramEngine from '../engine/TelegramEngine';

type Tab = 'setup' | 'prompt' | 'soul' | 'public' | 'memory' | 'multimedia';

export default function MainLayout() {
  const { isEngineRunning, setIsEngineRunning, apiKeys } = useAppContext();
  const [activeTab, setActiveTab] = useState<Tab>('setup');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems = [
    { id: 'setup', label: 'Configuration', icon: Settings },
    { id: 'prompt', label: 'Master Prompt', icon: Terminal },
    { id: 'soul', label: 'Soul Bot Process', icon: BrainCircuit },
    { id: 'public', label: 'Public Bot Process', icon: Globe },
    { id: 'memory', label: 'Memory Core', icon: Database },
    { id: 'multimedia', label: 'Multimedia', icon: ImageIcon },
  ] as const;

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  const toggleEngine = () => {
    if (!apiKeys.gemini || !apiKeys.telegramSoul || !apiKeys.telegramPublic) {
      alert("Please configure Gemini API Key and both Telegram Bot Tokens in the Configuration tab first.");
      setActiveTab('setup');
      return;
    }
    setIsEngineRunning(!isEngineRunning);
  };

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden relative">
      <TelegramEngine />
      
      {/* Mobile Header */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-14 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-4 z-30">
        <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Better You OS
        </h1>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
          className="p-2 text-gray-400 hover:text-white transition-colors"
        >
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-20"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:relative z-30 w-64 h-full bg-gray-950 border-r border-gray-800 flex flex-col transition-transform duration-300 ease-in-out ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } pt-14 md:pt-0`}>
        <div className="hidden md:block p-6">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Better You OS
          </h1>
          <p className="text-xs text-gray-500 mt-1">Digital Consciousness Core</p>
        </div>
        
        <nav className="flex-1 px-4 py-4 md:py-0 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-gray-800 text-white shadow-sm' 
                    : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button 
            onClick={toggleEngine}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition-colors ${
              isEngineRunning 
                ? 'bg-red-900/50 text-red-400 hover:bg-red-900/70 border border-red-800' 
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <Power className="w-5 h-5" />
            {isEngineRunning ? 'Stop AI Engine' : 'Start AI Engine'}
          </button>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mt-3">
            <div className={`w-2 h-2 rounded-full ${isEngineRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
            {isEngineRunning ? 'Engine Online & Polling' : 'Engine Offline'}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 pt-14 md:pt-0 overflow-hidden flex flex-col">
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {activeTab === 'setup' && <Setup />}
          {activeTab === 'prompt' && <SystemPrompt />}
          {activeTab === 'soul' && <SoulBot />}
          {activeTab === 'public' && <PublicBot />}
          {activeTab === 'memory' && <MemoryCore />}
          {activeTab === 'multimedia' && <Multimedia />}
        </div>
      </div>
    </div>
  );
}
