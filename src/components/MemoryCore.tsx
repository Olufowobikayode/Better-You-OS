import React, { useState, useEffect } from 'react';
import { Database, Server, HardDrive, Activity, AlertCircle, Tag, Clock, BrainCircuit, X, Edit2, Trash2, User, Bot, Zap, Upload } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Memory, Trait, Correction } from '../types';
import { v4 as uuidv4 } from 'uuid';

export default function MemoryCore() {
  const { apiKeys, memories, setMemories, emotionalState, setEmotionalState, corrections, setCorrections, traits, setTraits } = useAppContext();
  const [activeTab, setActiveTab] = useState<'memories' | 'emotions' | 'corrections' | 'traits'>('memories');
  const [filter, setFilter] = useState<'all' | 'personal' | 'training' | 'public_behavior' | 'simulated_thought'>('all');
  const [editingMemory, setEditingMemory] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  useEffect(() => {
    const handleSynthesisComplete = () => {
      setIsSynthesizing(false);
    };
    window.addEventListener('synthesis-complete', handleSynthesisComplete);
    return () => window.removeEventListener('synthesis-complete', handleSynthesisComplete);
  }, []);

  const filteredMemories = memories.filter(m => filter === 'all' || m.type === filter);

  const getSourceIcon = (source: Memory['source']) => {
    switch (source) {
      case 'soul_bot': return <User className="w-3 h-3" />;
      case 'public_bot': return <Bot className="w-3 h-3" />;
      case 'autonomous_core': return <Zap className="w-3 h-3" />;
      case 'manual_upload': return <Upload className="w-3 h-3" />;
      default: return <Database className="w-3 h-3" />;
    }
  };

  const deleteMemory = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const startEdit = (memory: Memory) => {
    setEditingMemory(memory.id);
    setEditContent(memory.content);
  };

  const saveEdit = (id: string) => {
    setMemories(prev => prev.map(m => m.id === id ? { ...m, content: editContent } : m));
    setEditingMemory(null);
  };

  const applyCorrection = (correction: Correction) => {
    // In a real app, this would trigger an LLM re-indexing. 
    // Here we mark it as applied and add a training memory.
    setCorrections(prev => prev.map(c => c.id === correction.id ? { ...c, applied: true } : c));
    
    const trainingMemory: Memory = {
      id: `mem_${uuidv4()}`,
      type: 'training',
      content: `[Applied Correction] ${correction.correctionText}`,
      tags: ['correction', 'identity_update'],
      timestamp: Date.now(),
      source: 'autonomous_core'
    };
    setMemories(prev => [trainingMemory, ...prev]);
  };

  const [isAddingTrait, setIsAddingTrait] = useState(false);
  const [newTraitCategory, setNewTraitCategory] = useState('');
  const [newTraitDescription, setNewTraitDescription] = useState('');

  const addTrait = () => {
    if (newTraitCategory && newTraitDescription) {
      const newTrait: Trait = {
        id: `trait_${uuidv4()}`,
        category: newTraitCategory,
        description: newTraitDescription,
        source: 'manual_entry'
      };
      setTraits(prev => [newTrait, ...prev]);
      setNewTraitCategory('');
      setNewTraitDescription('');
      setIsAddingTrait(false);
    }
  };

  const deleteTrait = (id: string) => {
    setTraits(prev => prev.filter(t => t.id !== id));
  };

  const [isPopulatingTraits, setIsPopulatingTraits] = useState(false);

  const populateRobustTraits = async () => {
    if (!apiKeys.groq && !apiKeys.gemini) {
      alert("Missing API Keys! Provide either Groq or Gemini in the Setup tab.");
      return;
    }
    
    setIsPopulatingTraits(true);
    
    try {
      const recentMemories = memories.slice(0, 50).map(m => m.content).join('\n- ');
      const existingTraitsStr = traits.map(t => `${t.category}: ${t.description}`).join('\n');
      
      const prompt = `Based on the following memory database of the user, extract exactly 5 NEW, distinct, highly specific personality traits, archetypes, or cognitive styles that define this user.
      ${recentMemories ? "DO NOT invent or guess data not supported by these memories." : "Since memories are currently empty, provide 5 highly generalized psychological human baselines to start the user off."}
      
      CRITICAL: The user already has the following traits recorded. DO NOT duplicate these in meaning or category:
      [CURRENT TRAITS]
      ${existingTraitsStr || "No existing traits."}

      Memories:
      ${recentMemories ? recentMemories : "[No memories yet]"}
      
      Output MUST be exactly in this strict JSON format and NOTHING ELSE:
      {
        "traits": [
          { "category": "Value / Archetype / Big Five", "description": "Specific finding based on memory" }
        ]
      }`;

      let result = '{}';
      const pref = apiKeys.preferredEngine || 'auto';
      const useGroq = (pref === 'auto' || pref === 'groq') && !!apiKeys.groq;
      const useGemini = (pref === 'auto' || pref === 'gemini') && !!apiKeys.gemini;

      if (useGroq && pref === 'groq' || (!useGemini && apiKeys.groq)) {
        const Groq = (await import('groq-sdk')).default;
        const groq = new Groq({ apiKey: apiKeys.groq, dangerouslyAllowBrowser: true });
        const chatCompletion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.3-70b-versatile',
          response_format: { type: 'json_object' }
        });
        result = chatCompletion.choices[0]?.message?.content || '{}';
      } else {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: apiKeys.gemini });
        const res = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });
        result = res.text || '{}';
      }

      result = result.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(result);
      
      if (parsed.traits && Array.isArray(parsed.traits)) {
        const newTraits: Trait[] = parsed.traits.map((t: any) => ({
          id: uuidv4(),
          category: t.category,
          description: t.description,
          source: 'groq_ai_extraction'
        }));
        // Kepping adding up to it without blindly overwriting
        setTraits(prev => [...prev, ...newTraits]);
      } else {
        alert("Failed to parse traits from AI output. It may not have generated correctly.");
      }
    } catch (e: any) {
      console.error("Trait extraction failed:", e);
      alert("Failed to populate AI traits: " + e.message);
    } finally {
      setIsPopulatingTraits(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-orange-500/20 rounded-lg">
          <Database className="w-6 h-6 text-orange-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Memory & Indexing Core</h2>
          <p className="text-gray-400 text-sm">Manage structured traits (Supabase) and unstructured vectors (MongoDB)</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        <button
          onClick={() => setActiveTab('memories')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
            activeTab === 'memories' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          Indexed Memories
        </button>
        <button
          onClick={() => setActiveTab('traits')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
            activeTab === 'traits' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <Tag className="w-4 h-4" />
          Personality Traits
        </button>
        <button
          onClick={() => setActiveTab('emotions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
            activeTab === 'emotions' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <Activity className="w-4 h-4" />
          Emotional State Tracker
        </button>
        <button
          onClick={() => setActiveTab('corrections')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
            activeTab === 'corrections' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          Feedback & Corrections
          {corrections.filter(c => !c.applied).length > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full ml-2">
              {corrections.filter(c => !c.applied).length}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 p-4 md:p-6 overflow-hidden flex flex-col">
        {activeTab === 'memories' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 gap-4 shrink-0">
              <h3 className="text-lg font-semibold text-white">Memory Index</h3>
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                <button 
                  disabled={isSynthesizing}
                  onClick={() => {
                    setIsSynthesizing(true);
                    window.dispatchEvent(new CustomEvent('trigger-synthesis'));
                  }}
                  className={`w-full sm:w-auto px-3 py-1.5 text-white text-[10px] font-bold rounded-md transition-colors flex items-center justify-center gap-2 uppercase tracking-wider ${
                    isSynthesizing ? 'bg-indigo-800 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isSynthesizing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Synthesizing...
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="w-4 h-4" />
                      Synthesize Knowledge
                    </>
                  )}
                </button>
                <div className="flex gap-2 bg-gray-950 p-1 rounded-lg border border-gray-800 w-full overflow-x-auto scrollbar-hide">
                  {['all', 'personal', 'training', 'public_behavior', 'simulated_thought'].map(type => (
                    <button
                      key={type}
                      onClick={() => setFilter(type as any)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md capitalize whitespace-nowrap uppercase tracking-wider ${
                        filter === type ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {type.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
              {filteredMemories.length === 0 ? (
                <div className="text-center text-gray-500 mt-10">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No memories indexed yet.</p>
                  <p className="text-sm">Use the Soul Bot or Mini Browser to generate data.</p>
                </div>
              ) : (
                filteredMemories.map(memory => (
                  <div key={memory.id} className={`p-4 bg-gray-950 rounded-lg border ${memory.flaggedForReview ? 'border-red-900/50 bg-red-950/10' : 'border-gray-800'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                          memory.type === 'personal' ? 'bg-blue-900/50 text-blue-400' :
                          memory.type === 'training' ? 'bg-purple-900/50 text-purple-400' :
                          memory.type === 'public_behavior' ? 'bg-emerald-900/50 text-emerald-400' :
                          'bg-yellow-900/50 text-yellow-400'
                        }`}>
                          {memory.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-md flex items-center gap-1 uppercase font-bold tracking-wider">
                          {getSourceIcon(memory.source)}
                          {memory.source.replace('_', ' ')}
                        </span>
                        {memory.emotion && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Activity className="w-3 h-3" /> {memory.emotion}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-gray-500 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {new Date(memory.timestamp).toLocaleTimeString()}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(memory)} className="p-1 text-gray-500 hover:text-blue-400 transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteMemory(memory.id)} className="p-1 text-gray-500 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {editingMemory === memory.id ? (
                      <div className="space-y-2">
                        <textarea 
                          className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingMemory(null)} className="text-xs bg-gray-800 text-white px-2 py-1 rounded">Cancel</button>
                          <button onClick={() => saveEdit(memory.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">{memory.content}</p>
                        {memory.mediaUrl && (
                          <div className="mt-2 rounded-lg overflow-hidden border border-gray-800 max-w-sm">
                            {memory.mediaType === 'image' && (
                              <img src={memory.mediaUrl} alt="Memory" className="w-full h-auto" referrerPolicy="no-referrer" />
                            )}
                            {memory.mediaType === 'video' && (
                              <video src={memory.mediaUrl} controls className="w-full h-auto" />
                            )}
                            {memory.mediaType === 'audio' && (
                              <audio src={memory.mediaUrl} controls className="w-full" />
                            )}
                            {memory.mediaType === 'document' && (
                              <div className="p-3 bg-gray-900 flex items-center gap-2 text-xs text-gray-400">
                                <HardDrive className="w-4 h-4" /> Document Attached
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {memory.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {memory.tags.map(tag => (
                          <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded flex items-center gap-1">
                            <Tag className="w-3 h-3" /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'traits' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 shrink-0">
              <h3 className="text-lg font-semibold text-white">Personality Matrix</h3>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button 
                  onClick={populateRobustTraits}
                  disabled={isPopulatingTraits}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-white text-[10px] font-bold rounded-md transition-colors uppercase tracking-wider flex items-center justify-center gap-2 ${
                    isPopulatingTraits ? 'bg-gray-700 cursor-not-allowed' : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  {isPopulatingTraits ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Populating...
                    </>
                  ) : (
                    'Populate AI Traits'
                  )}
                </button>
                <button 
                  onClick={() => setIsAddingTrait(true)}
                  className="flex-1 sm:flex-none px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-md transition-colors uppercase tracking-wider"
                >
                  Add Custom Trait
                </button>
              </div>
            </div>

            {isAddingTrait && (
              <div className="mb-4 p-4 bg-gray-950 rounded-lg border border-blue-900/50 space-y-3 shrink-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input 
                    type="text"
                    placeholder="Category (e.g. Value, Hobby)"
                    className="bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
                    value={newTraitCategory}
                    onChange={(e) => setNewTraitCategory(e.target.value)}
                  />
                  <input 
                    type="text"
                    placeholder="Description"
                    className="bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
                    value={newTraitDescription}
                    onChange={(e) => setNewTraitDescription(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsAddingTrait(false)} className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded">Cancel</button>
                  <button onClick={addTrait} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded">Save Trait</button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
              {traits.length === 0 ? (
                <div className="text-center text-gray-500 mt-10">
                  <Tag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No traits defined yet.</p>
                  <p className="text-sm">Define your personality archetypes to guide the AI.</p>
                </div>
              ) : (
                traits.map(trait => (
                  <div key={trait.id} className="p-4 bg-gray-950 rounded-lg border border-gray-800 flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{trait.category}</span>
                      <p className="text-sm text-gray-200 mt-1">{trait.description}</p>
                      <p className="text-[10px] text-gray-600 mt-2 italic">Source: {trait.source}</p>
                    </div>
                    <button onClick={() => deleteTrait(trait.id)} className="text-gray-600 hover:text-red-400">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'emotions' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h3 className="text-lg font-semibold text-white">Current Emotional State</h3>
              <button 
                onClick={() => setEmotionalState({ currentEmotion: 'Neutral', intensity: 0, mappedTrait: 'Unknown', zodiacAlignment: 'Unknown' })}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-[10px] font-bold rounded-md transition-colors flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                Clear / Reset State
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 pr-2">
              {emotionalState ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-950 p-6 rounded-xl border border-gray-800">
                  <h4 className="text-sm text-gray-500 mb-1">Detected Emotion</h4>
                  <p className="text-2xl font-bold text-purple-400">{emotionalState.currentEmotion}</p>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Intensity</span>
                      <span>{emotionalState.intensity}/10</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${(emotionalState.intensity / 10) * 100}%` }}></div>
                    </div>
                  </div>
                  {emotionalState.energyLevel !== undefined && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Simulated Energy (Circadian Rhythm)</span>
                        <span>{emotionalState.energyLevel}%</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div className="bg-yellow-500 h-2 rounded-full" style={{ width: `${emotionalState.energyLevel}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="bg-gray-950 p-6 rounded-xl border border-gray-800">
                  <h4 className="text-sm text-gray-500 mb-1">Mapped Trait (Supabase Sync)</h4>
                  <p className="text-lg font-medium text-white mb-4">{emotionalState.mappedTrait}</p>
                  <h4 className="text-sm text-gray-500 mb-1">Zodiac Alignment</h4>
                  <p className="text-lg font-medium text-white">{emotionalState.zodiacAlignment}</p>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 mt-10">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No emotional data tracked yet.</p>
                <p className="text-sm">Interact with the Soul Bot to begin profiling.</p>
              </div>
            )}
            </div>
          </div>
        )}

        {activeTab === 'corrections' && (
          <div className="flex-1 flex flex-col min-h-0">
            <h3 className="text-lg font-semibold text-white mb-4 shrink-0">Correction Loop Queue</h3>
            <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
              {corrections.filter(c => !c.applied).length === 0 ? (
                <div className="text-center text-gray-500 mt-10">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No pending corrections.</p>
                  <p className="text-sm">The AI model is currently aligned with your feedback.</p>
                </div>
              ) : (
                corrections.filter(c => !c.applied).map(correction => (
                  <div key={correction.id} className="p-4 bg-red-950/20 rounded-lg border border-red-900/50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-medium text-red-400 uppercase bg-red-900/30 px-2 py-1 rounded">
                        Model Override Required
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(correction.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 mb-3">"{correction.correctionText}"</p>
                    <div className="flex justify-end">
                      <button 
                        onClick={() => applyCorrection(correction)}
                        className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition-colors"
                      >
                        Apply to Core Identity
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
