declare global {
  interface Window {
    Telegram?: {
      WebApp: any;
    };
  }
}

export interface ApiKeys {
  gemini: string;
  groq: string;
  preferredEngine?: 'auto' | 'groq' | 'gemini';
  supabaseUrl: string;
  supabaseKey: string;
  mongoDbUrl: string;
  telegramSoul: string;
  telegramPublic: string;
  userTelegramId: string;
  zodiacSign: string;
  publicBotMode?: 'watch' | 'interactive';
}

export type MemoryType = 'personal' | 'training' | 'public_behavior' | 'simulated_thought';

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  emotion?: string;
  tags: string[];
  timestamp: number;
  source: 'soul_bot' | 'public_bot' | 'autonomous_core' | 'manual_upload';
  flaggedForReview?: boolean;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
}

export interface Trait {
  id: string;
  category: string;
  description: string;
  source: string;
}

export interface EmotionalState {
  currentEmotion: string;
  intensity: number;
  mappedTrait: string;
  zodiacAlignment: string;
  energyLevel?: number; // Added to make it human-like (Circadian rhythm)
}

export interface Correction {
  id: string;
  targetId?: string;
  correctionText: string;
  timestamp: number;
  applied: boolean;
}

export interface ProcessLog {
  id: string;
  bot: 'soul' | 'public' | 'system';
  type: 'receive' | 'process' | 'send' | 'error' | 'memory_index' | 'simulate';
  content: string;
  timestamp: number;
  metadata?: any;
}
