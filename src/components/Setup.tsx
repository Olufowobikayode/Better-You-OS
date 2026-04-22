import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Key, Save, CheckCircle } from 'lucide-react';

export default function Setup() {
  const { apiKeys, setApiKeys } = useAppContext();
  const [localKeys, setLocalKeys] = useState(apiKeys);
  const [saved, setSaved] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalKeys({ ...localKeys, [e.target.name]: e.target.value });
    setSaved(false);
  };

  const handleSave = () => {
    setApiKeys(localKeys);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const executeWipe = async () => {
    setShowWipeConfirm(false);
    try {
      // 1. Wipe Supabase Remote Data
      if (localKeys.supabaseUrl && localKeys.supabaseKey) {
        const headers = {
          'apikey': localKeys.supabaseKey,
          'Authorization': `Bearer ${localKeys.supabaseKey}`,
          'Content-Type': 'application/json'
        };
        const wipeTables = ['memories', 'traits', 'logs', 'emotions'];
        for (const table of wipeTables) {
          try {
            await fetch(`${localKeys.supabaseUrl}/rest/v1/${table}?id=not.is.null`, { 
              method: 'DELETE', 
              headers 
            });
          } catch (e) {
              console.warn(`Could not wipe supabase table ${table}`, e);
          }
        }
      }

      // 2. Wipe MongoDB Remote Data
      if (localKeys.mongoDbUrl) {
        try {
            await fetch(`${localKeys.mongoDbUrl}/action/deleteMany`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dataSource: "Cluster0", 
                database: "brain_db", 
                collection: "memories", 
                filter: {} 
              })
            });
        } catch(e) {
            console.warn("Could not wipe mongo DB", e);
        }
      }

      // 3. Wipe all Local Storage forms
      localStorage.clear();
      
      // Wipe localforage
      const importedLocalForage = (await import('localforage')).default;
      await importedLocalForage.clear();

      // Wipe standard IndexedDBs
      const dbs = await window.indexedDB.databases();
      dbs.forEach(db => { if (db.name) window.indexedDB.deleteDatabase(db.name); });
      
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      alert(`Error during wipe: ${err.message}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-gray-900 rounded-xl border border-gray-800 shadow-2xl relative">
      {/* Wipe Confirmation Modal */}
      {showWipeConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-red-900 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-red-500 mb-2">Destructive Action</h3>
            <p className="text-gray-300 text-sm mb-6">
              WARNING: This will DESTROY all indexed memories, traits, context, and databases permanently, both locally and externally (Supabase/MongoDB if configured). Are you absolutely sure?
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowWipeConfirm(false)}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition"
              >
                Cancel
              </button>
              <button 
                onClick={executeWipe}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-bold transition"
              >
                Yes, Wipe Everything
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-blue-500/20 rounded-lg">
          <Key className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">System Configuration</h2>
          <p className="text-gray-400 text-sm">All keys are stored locally in your browser. No backend .env files.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-800 pb-2">AI Engines</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Preferred Engine for App</label>
              <select
                name="preferredEngine"
                value={localKeys.preferredEngine || 'auto'}
                onChange={(e) => setLocalKeys({ ...localKeys, preferredEngine: e.target.value as 'auto' | 'groq' | 'gemini' })}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all mb-4"
              >
                <option value="auto">Auto (Smart Routing / Mixed)</option>
                <option value="groq">Groq Only</option>
                <option value="gemini">Gemini Only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Gemini API Key (Reasoning)</label>
              <input
                type="password"
                name="gemini"
                value={localKeys.gemini}
                onChange={handleChange}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="AIzaSy..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Groq API Key (Action)</label>
              <input
                type="password"
                name="groq"
                value={localKeys.groq}
                onChange={handleChange}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="gsk_..."
              />
            </div>

            <div className="pt-2">
              <label className="block text-sm font-semibold text-blue-400 mb-1 flex items-center justify-between">
                Render Persistence (Keep-Alive)
                <span className="text-[10px] bg-blue-500/10 px-2 py-0.5 rounded text-blue-300 animate-pulse">5m Loop Active</span>
              </label>
              <input
                type="text"
                name="renderUrl"
                value={localKeys.renderUrl}
                onChange={handleChange}
                className="w-full bg-gray-950 border border-blue-900/30 rounded-lg px-4 py-2 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="https://your-app.onrender.com"
              />
              <p className="text-[10px] text-gray-500 mt-1 italic">Providing your public Render URL enables a hard-ping loop to prevent container sleep.</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-800 pb-2">Memory Core</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Supabase URL</label>
              <input
                type="text"
                name="supabaseUrl"
                value={localKeys.supabaseUrl}
                onChange={handleChange}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="https://xyzcompany.supabase.co"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Supabase Anon Key</label>
              <input
                type="password"
                name="supabaseKey"
                value={localKeys.supabaseKey}
                onChange={handleChange}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">MongoDB Atlas Data API URL</label>
              <input
                type="text"
                name="mongoDbUrl"
                value={localKeys.mongoDbUrl}
                onChange={handleChange}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="https://data.mongodb-api.com/..."
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-800 pb-2">Appendages (Telegram)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Soul Bot Token (Private)</label>
              <input
                type="password"
                name="telegramSoul"
                value={localKeys.telegramSoul}
                onChange={handleChange}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="123456789:ABCdef..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Public Bot Token (Group)</label>
              <input
                type="password"
                name="telegramPublic"
                value={localKeys.telegramPublic}
                onChange={handleChange}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all mb-3"
                placeholder="987654321:XYZuvw..."
              />
              
              <label className="block text-sm font-medium text-gray-400 mb-1">Public Bot Group Mode</label>
              <select
                name="publicBotMode"
                value={localKeys.publicBotMode || 'interactive'}
                onChange={(e) => setLocalKeys({ ...localKeys, publicBotMode: e.target.value as 'watch' | 'interactive' })}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              >
                <option value="interactive">Interactive (Index User & Reply)</option>
                <option value="watch">Watch Mode (Only Index User Patterns)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-6 flex justify-between relative z-10">
          <button
            onClick={() => setShowWipeConfirm(true)}
            className="flex items-center gap-2 bg-red-900/30 border border-red-900/50 hover:bg-red-800/80 text-red-500 hover:text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-xs uppercase tracking-wider"
          >
            Wipe Entire Database
          </button>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            {saved ? <CheckCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {saved ? 'Saved Configuration' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
