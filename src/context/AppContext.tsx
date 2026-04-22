import { ApiKeys, Trait, Memory, EmotionalState, Correction, ProcessLog } from '../types';
import React, { createContext, useContext, useState, useEffect } from 'react';
import localforage from 'localforage';

interface AppContextType {
  apiKeys: ApiKeys;
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeys>>;
  processLogs: ProcessLog[];
  setProcessLogs: React.Dispatch<React.SetStateAction<ProcessLog[]>>;
  traits: Trait[];
  setTraits: React.Dispatch<React.SetStateAction<Trait[]>>;
  memories: Memory[];
  setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
  emotionalState: EmotionalState | null;
  setEmotionalState: React.Dispatch<React.SetStateAction<EmotionalState | null>>;
  corrections: Correction[];
  setCorrections: React.Dispatch<React.SetStateAction<Correction[]>>;
  isEngineRunning: boolean;
  setIsEngineRunning: React.Dispatch<React.SetStateAction<boolean>>;
}

const defaultKeys: ApiKeys = {
  gemini: '',
  groq: '',
  preferredEngine: 'auto',
  renderUrl: '',
  supabaseUrl: '',
  supabaseKey: '',
  mongoDbUrl: '',
  telegramSoul: '',
  telegramPublic: '',
  userTelegramId: '',
  zodiacSign: '',
  publicBotMode: 'interactive',
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKeys, setApiKeys] = useState<ApiKeys>(defaultKeys);
  const [processLogs, setProcessLogs] = useState<ProcessLog[]>([]);
  const [traits, setTraits] = useState<Trait[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [emotionalState, setEmotionalState] = useState<EmotionalState | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    localforage.config({
      name: 'BetterYouOS',
      storeName: 'brain_data'
    });

    const loadData = async () => {
      try {
        const savedKeys = await localforage.getItem<ApiKeys>('apiKeys');
        if (savedKeys) setApiKeys(savedKeys);

        const savedMemories = await localforage.getItem<Memory[]>('memories');
        if (savedMemories) setMemories(savedMemories);

        const savedState = await localforage.getItem<EmotionalState>('emotionalState');
        if (savedState) setEmotionalState(savedState);

        const savedCorrections = await localforage.getItem<Correction[]>('corrections');
        if (savedCorrections) setCorrections(savedCorrections);

        const savedTraits = await localforage.getItem<Trait[]>('traits');
        if (savedTraits) setTraits(savedTraits);
      } catch (e) {
        console.error("Failed to load data from localforage", e);
      } finally {
        setIsLoaded(true);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem('apiKeys', apiKeys);
  }, [apiKeys, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem('memories', memories);
  }, [memories, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem('emotionalState', emotionalState);
  }, [emotionalState, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem('corrections', corrections);
  }, [corrections, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem('traits', traits);
  }, [traits, isLoaded]);

  if (!isLoaded) {
    return <div className="h-screen w-screen bg-black flex items-center justify-center text-white">Loading Digital Consciousness...</div>;
  }

  return (
    <AppContext.Provider value={{
      apiKeys, setApiKeys,
      processLogs, setProcessLogs,
      traits, setTraits,
      memories, setMemories,
      emotionalState, setEmotionalState,
      corrections, setCorrections,
      isEngineRunning, setIsEngineRunning
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
