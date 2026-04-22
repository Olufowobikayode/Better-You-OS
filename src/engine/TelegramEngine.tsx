import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Memory, ProcessLog, Trait } from '../types';
import { MASTER_PROMPT } from '../lib/prompts';
import Fuse from 'fuse.js';
import * as googleTTS from 'google-tts-api';
import PQueue from 'p-queue';
import { LRUCache } from 'lru-cache';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import Groq from 'groq-sdk';
import { callGroqReasoning } from './GroqEngine';

// Enterprise-grade concurrency control to prevent API rate-limiting and optimize processing
const processingQueue = new PQueue({ concurrency: 2, intervalCap: 2, interval: 1000 });

// Cache for repetitive RAG queries to save processing time
const ragCache = new LRUCache<string, string>({ max: 100, ttl: 1000 * 60 * 5 });

import { getCachedResponse, setCachedResponse, analyzeLocalNLP } from './LocalIntelligence';
import { analyzeImage, extractPdfText } from './MediaProcessor';

export default function TelegramEngine() {
  const { apiKeys, setProcessLogs, setMemories, memories, emotionalState, setEmotionalState, setCorrections, isEngineRunning, traits, setTraits } = useAppContext();
  
  const soulOffset = useRef(0);
  const publicOffset = useRef(0);
  const isPolling = useRef(false);
  const memoriesRef = useRef(memories);
  const emotionalStateRef = useRef(emotionalState);
  const traitsRef = useRef(traits);

  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

  useEffect(() => {
    emotionalStateRef.current = emotionalState;
  }, [emotionalState]);

  useEffect(() => {
    traitsRef.current = traits;
  }, [traits]);

  const addLog = (bot: 'soul' | 'public' | 'system', type: ProcessLog['type'], content: string, metadata?: any) => {
    setProcessLogs(prev => [...prev, {
      id: `log_${uuidv4()}`,
      bot, type, content, timestamp: Date.now(), metadata
    }]);
  };

  const sendTelegramMessage = async (token: string, chatId: number, text: string) => {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text
      });
    } catch (e) {
      console.error('Failed to send Telegram message', e);
    }
  };

  const sendTelegramPhoto = async (token: string, chatId: number, base64Image: string) => {
    try {
      const byteCharacters = atob(base64Image);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('chat_id', chatId.toString());
      formData.append('photo', blob, 'image.jpg');

      await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } catch (e) {
      console.error('Failed to send Telegram photo', e);
    }
  };

  const sendTelegramVoiceUrl = async (token: string, chatId: number, voiceUrl: string) => {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendVoice`, {
        chat_id: chatId,
        voice: voiceUrl
      });
    } catch (e) {
      console.error('Failed to send Telegram voice', e);
    }
  };

  const getTelegramFile = async (token: string, fileId: string) => {
    try {
      const res = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      if (!res.data.ok) return null;
      
      const fileUrl = `https://api.telegram.org/file/bot${token}/${res.data.result.file_path}`;
      let blob: Blob;
      
      // Try multiple proxy services to bypass 403/CORS issues
      const proxies = [
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
      ];

      let lastError = null;
      for (const getProxyUrl of proxies) {
        try {
          const proxyUrl = getProxyUrl(fileUrl);
          const fileRes = await axios.get(proxyUrl, { responseType: 'blob', timeout: 10000 });
          blob = fileRes.data;
          if (blob) break;
        } catch (err) {
          lastError = err;
          console.warn(`Proxy attempt failed, trying next...`, err);
          continue;
        }
      }

      if (!blob!) {
        throw lastError || new Error("All proxy attempts failed");
      }
      
      return new Promise<{ inlineData: { data: string, mimeType: string } }>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({
          inlineData: {
            data: (reader.result as string).split(',')[1],
            mimeType: blob.type
          }
        });
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Failed to fetch telegram file after multiple proxy attempts", e);
      return null;
    }
  };

  const callGeminiReasoning = async (systemPrompt: string, userPrompt: string, isJson: boolean = false, filePart: any = null) => {
    if (!apiKeys.gemini && !apiKeys.groq) throw new Error("API keys explicitly missing for Reasoning Engine");
    
    const cacheKey = `gemini_${systemPrompt}_${userPrompt}_${isJson}`;
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      console.log("Using LangChain cached response to save Gemini quota.");
      return cached;
    }

    try {
      if (!apiKeys.gemini) {
        throw new Error("Gemini API key missing, forcing Groq fallback.");
      }

      const ai = new GoogleGenAI({ apiKey: apiKeys.gemini });
      
      let additionalContext = "";
      let finalUserPrompt = userPrompt;
      let contents: any[] = [{ text: finalUserPrompt }];

      if (filePart) {
        if (filePart.inlineData.mimeType.startsWith('image/')) {
           additionalContext = await analyzeImage(filePart.inlineData.data, filePart.inlineData.mimeType);
        } else if (filePart.inlineData.mimeType === 'application/pdf') {
           additionalContext = await extractPdfText(filePart.inlineData.data);
        }
        finalUserPrompt = additionalContext ? `${userPrompt}\n\n${additionalContext}` : userPrompt;
        contents = [
          { text: finalUserPrompt },
          { inlineData: filePart.inlineData }
        ];
      }

      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: { 
          systemInstruction: systemPrompt,
          responseMimeType: isJson ? "application/json" : "text/plain"
        }
      });
      const result = res.text || '';
      await setCachedResponse(cacheKey, result);
      return result;
    } catch (e: any) {
      const errMsg = e.message || "";
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('API key not valid') || !apiKeys.gemini) {
        console.warn(`Gemini Reasoning unavailable (${errMsg}). Falling back to Groq Highest Reasoning Model.`);
        return await callGroqReasoningFallback(systemPrompt, userPrompt, isJson, filePart);
      }
      console.error("Gemini Reasoning failed for non-quota reason:", e);
      throw e;
    }
  };

  const callGroqReasoningFallback = async (systemPrompt: string, userPrompt: string, isJson: boolean = false, filePart: any = null) => {
    if (!apiKeys.groq) throw new Error("Groq API key missing for Fallback Reasoning Engine");

    const groq = new Groq({ apiKey: apiKeys.groq, dangerouslyAllowBrowser: true });
    
    let model = 'llama-3.3-70b-versatile'; // Highest reasoning model available natively through Groq API routing
    let userContent: any = userPrompt;

    if (filePart) {
      if (filePart.inlineData.mimeType.startsWith('image/')) {
        model = 'llama-3.2-11b-vision-preview';
        userContent = [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: `data:${filePart.inlineData.mimeType};base64,${filePart.inlineData.data}` } }
        ];
      } else {
        // Groq vision model only supports images. Text extract fallback was not done for Groq alone.
        userContent = `${userPrompt}\n\n[Note: Multimodal document extraction failed due to primary reasoning engine limits].`;
      }
    }

    const options: any = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      model: model,
    };

    if (isJson && !filePart) {
      options.response_format = { type: 'json_object' };
    }

    const chatCompletion = await groq.chat.completions.create(options);
    const result = chatCompletion.choices[0]?.message?.content || '';
    
    return result;
  };

  const callGroqAction = async (systemPrompt: string, userPrompt: string) => {
    if (!apiKeys.groq) throw new Error("Groq API key missing for Action Engine");
    
    const cacheKey = `groq_${systemPrompt}_${userPrompt}`;
    const cached = await getCachedResponse(cacheKey);
    if (cached) return cached;

    const groq = new Groq({ apiKey: apiKeys.groq, dangerouslyAllowBrowser: true });
    
    const options: any = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.1-8b-instant',
    };

    const chatCompletion = await groq.chat.completions.create(options);
    const result = chatCompletion.choices[0]?.message?.content || '';
    
    await setCachedResponse(cacheKey, result);
    return result;
  };

  const runSynthesis = async () => {
    if (!apiKeys.gemini && !apiKeys.groq) {
      alert("Missing API Keys for Synthesis. Please add them in the setup tab.");
      window.dispatchEvent(new CustomEvent('synthesis-complete'));
      return;
    }
    
    console.log("Starting synthesis task...");
    try {
      console.log("Synthesis task started.");
      addLog('system', 'simulate', 'Running autonomous deep memory synthesis...');
      const recentMemories = memoriesRef.current.slice(0, 50).map(m => m.content).join('\n- ');
      
      // Calculate basic energy level based on hour of day to simulate circadian rhythm
      const hour = new Date().getHours();
      // Peak energy at 10am, lowest at 3am
      let simulatedEnergy = 50; 
      if (hour >= 8 && hour <= 12) simulatedEnergy = 90;
      else if (hour > 12 && hour <= 17) simulatedEnergy = 75;
      else if (hour > 17 && hour <= 22) simulatedEnergy = 60;
      else if (hour > 22 || hour < 4) simulatedEnergy = 20;
      else if (hour >= 4 && hour < 8) simulatedEnergy = 40;

      // Add a random variation +/- 10
      simulatedEnergy = Math.max(1, Math.min(100, simulatedEnergy + (Math.floor(Math.random() * 21) - 10)));

      const prompt = `${MASTER_PROMPT}

You are currently in an idle state. You have a simulated energy level of ${simulatedEnergy}/100 based on the current time of day (${new Date().toLocaleTimeString()}).
Act like NotebookLM synthesizing a deep knowledge graph, OR let your mind wander like a human having a spontaneous thought.
Review these recent memories/data points if needed:
${recentMemories}

CRITICAL: Generate a deep, synthesized realization about your personality, OR a random spontaneous thought (e.g. "I wonder if...", "I randomly remembered..."). 

Output ONLY the thought without any tags. Do not put <think> tags in final output.`;
      
      const pref = apiKeys.preferredEngine || 'auto';
      const useGroq = (pref === 'auto' || pref === 'groq') && !!apiKeys.groq;
      const useGemini = (pref === 'auto' || pref === 'gemini') && !!apiKeys.gemini;
      
      let thoughtText = '';
      if (useGroq && pref === 'groq') {
        console.log("Using Groq for synthesis (Preferred)...");
        thoughtText = await callGroqReasoning(apiKeys.groq, "Synthesize my memories or wander.", prompt, false, 'llama-3.3-70b-versatile');
      } else if (useGemini && pref === 'gemini') {
        console.log("Using Gemini for synthesis (Preferred)...");
        thoughtText = await callGeminiReasoning(prompt, "Synthesize my memories or wander.");
      } else if (useGroq) {
        console.log("Using Groq for synthesis (Auto)...");
        thoughtText = await callGroqReasoning(apiKeys.groq, "Synthesize my memories or wander.", prompt, false, 'llama-3.3-70b-versatile');
      } else if (useGemini) {
        console.log("Using Gemini for synthesis (Auto)...");
        thoughtText = await callGeminiReasoning(prompt, "Synthesize my memories or wander.");
      }
      
      const thought = thoughtText || "I am reflecting on my existence.";
      console.log("Synthesis generated thought:", thought);
      addLog('system', 'simulate', `Spontaneous Thought (Energy: ${simulatedEnergy}%): "${thought}"`);
      
      setMemories(prev => [{
        id: `mem_${uuidv4()}`,
        type: 'simulated_thought',
        content: `[Spontaneous Thought | Energy: ${simulatedEnergy}%] ${thought}`,
        tags: ['reflection', 'autonomous', 'synthesis', 'spontaneous'],
        timestamp: Date.now(),
        source: 'autonomous_core'
      }, ...prev]);

      // Also update emotional state with energy level
      setEmotionalState(prev => prev ? { ...prev, energyLevel: simulatedEnergy } : { currentEmotion: 'Wandering', intensity: 3, mappedTrait: 'Introspective', zodiacAlignment: apiKeys.zodiacSign || 'Unknown', energyLevel: simulatedEnergy });
      console.log("Synthesis complete and memory appended.");

    } catch (err: any) {
      console.error("Synthesis failed:", err);
      alert(`Synthesis failed: ${err.message}`);
      if (err.status === 429 || err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
        addLog('system', 'error', 'Simulation loop failed: API Rate Limit Exceeded (429).');
      } else {
        addLog('system', 'error', `Simulation loop failed: ${err.message}`);
      }
    } finally {
      window.dispatchEvent(new CustomEvent('synthesis-complete'));
    }
  };

  const runTraitExtraction = async () => {
    if (!apiKeys.groq && !apiKeys.gemini) return;
    try {
      console.log("Automatic Trait Extraction started.");
      addLog('system', 'process', 'Running autonomous background trait extraction...');
      
      const recentMemories = memoriesRef.current.slice(0, 50).map(m => m.content).join('\n- ');
      const existingTraitsStr = traitsRef.current.map(t => `${t.category}: ${t.description}`).join('\n');
      
      const prompt = `Based on the following memory database of the user, extract exactly 2 NEW, distinct, highly specific personality traits, archetypes, or cognitive styles that define this user.
      ${recentMemories ? "DO NOT invent or guess data not supported by these memories." : "Since memories are currently empty, provide 2 highly generalized psychological human baselines to start the user off."}
      
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

      const pref = apiKeys.preferredEngine || 'auto';
      const useGroq = (pref === 'auto' || pref === 'groq') && !!apiKeys.groq;
      const useGemini = (pref === 'auto' || pref === 'gemini') && !!apiKeys.gemini;

      let resultText = '';
      if (useGroq && pref === 'groq') {
        resultText = await callGroqReasoning(apiKeys.groq, "Extract robust personality traits in strict JSON.", prompt, true, 'llama-3.3-70b-versatile');
      } else if (useGemini && pref === 'gemini') {
        resultText = await callGeminiReasoning(prompt, "Extract robust personality traits in strict JSON."); 
      } else if (useGroq) {
        resultText = await callGroqReasoning(apiKeys.groq, "Extract robust personality traits in strict JSON.", prompt, true, 'llama-3.3-70b-versatile');
      } else if (useGemini) {
        resultText = await callGeminiReasoning(prompt, "Extract robust personality traits in strict JSON."); 
      }
      
      resultText = resultText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(resultText);
      
      if (parsed.traits && Array.isArray(parsed.traits)) {
        const newTraits: Trait[] = parsed.traits.map((t: any) => ({
          id: uuidv4(),
          category: t.category,
          description: t.description,
          source: 'autonomous_core'
        }));
        
        if (newTraits.length > 0) {
          setTraits(prev => [...prev, ...newTraits]);
          addLog('system', 'simulate', `Matrix Automatically Expanded with ${newTraits.length} new traits.`);
        }
      }
    } catch (err: any) {
      console.warn("Autonomous trait extraction failed:", err.message);
      // Don't alert the user for background tasks
    }
  };

  useEffect(() => {
    const handleManualSynthesis = () => {
      runSynthesis();
    };
    window.addEventListener('trigger-synthesis', handleManualSynthesis as EventListener);
    return () => {
      window.removeEventListener('trigger-synthesis', handleManualSynthesis as EventListener);
    };
  }, [apiKeys, runSynthesis]);

  useEffect(() => {
    if (!isEngineRunning) {
      isPolling.current = false;
      return;
    }

    isPolling.current = true;

    const pingInterval = setInterval(() => {
      axios.get(window.location.href).catch(() => {});
      addLog('system', 'process', `Sent keep-alive ping to server at ${format(new Date(), 'HH:mm:ss')}.`);
    }, 14 * 60 * 1000);

    const simulationInterval = setInterval(runSynthesis, 5 * 60 * 1000);
    const backgroundTraitInterval = setInterval(runTraitExtraction, 10 * 60 * 1000); // Runs automatically every 10 mins

    const pollSoulBot = async () => {
      if (!isPolling.current || !apiKeys.telegramSoul || !apiKeys.gemini) return;
      
      try {
        const res = await axios.get(`https://api.telegram.org/bot${apiKeys.telegramSoul}/getUpdates?offset=${soulOffset.current}&timeout=5`);
        const data = res.data;
        
        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            soulOffset.current = update.update_id + 1;
            
            if (update.message) {
              // Queue the processing to prevent rate limits and optimize memory usage
              processingQueue.add(async () => {
                try {
                  const msg = update.message;
                  const chatId = msg.chat.id;
                  
                  let textContent = msg.text || '';
                  let filePart = null;
                  
                  if (msg.photo) {
                    const fileId = msg.photo[msg.photo.length - 1].file_id;
                    filePart = await getTelegramFile(apiKeys.telegramSoul, fileId);
                    textContent = msg.caption || '[User sent an image]';
                    addLog('soul', 'receive', `Received Image from User: "${textContent}"`);
                  } else if (msg.voice) {
                    filePart = await getTelegramFile(apiKeys.telegramSoul, msg.voice.file_id);
                    textContent = '[User sent a voice note]';
                    addLog('soul', 'receive', `Received Voice Note from User`);
                  } else if (msg.audio) {
                    filePart = await getTelegramFile(apiKeys.telegramSoul, msg.audio.file_id);
                    textContent = msg.caption || `[User sent audio: ${msg.audio.file_name || 'audio_file'}]`;
                    addLog('soul', 'receive', `Received Audio from User`);
                  } else if (msg.document) {
                    filePart = await getTelegramFile(apiKeys.telegramSoul, msg.document.file_id);
                    textContent = msg.caption || `[User sent a document: ${msg.document.file_name}]`;
                    addLog('soul', 'receive', `Received Document from User: ${msg.document.file_name}`);
                  } else if (msg.video) {
                    filePart = await getTelegramFile(apiKeys.telegramSoul, msg.video.file_id);
                    textContent = msg.caption || '[User sent a video]';
                    addLog('soul', 'receive', `Received Video from User`);
                  } else {
                    addLog('soul', 'receive', `Received from User: "${textContent}"`);
                  }
                  
                  addLog('soul', 'process', 'Gemini (Reasoning Mode): Analyzing multimodal input, emotion, traits, and intent...');
                  
                  const systemInstruction = `${MASTER_PROMPT}\n\n---
You are currently operating as the SOUL BOT (Private Training Core).
Analyze the user's input (which may include text, images, audio, or documents).
If the input is a long document, act like NotebookLM and extract the core entities, themes, and emotional weight.
If the input is a voice note, focus on the tone and speaking style.
Current Zodiac Sign: ${apiKeys.zodiacSign || 'Unknown'}
Current Emotional State: ${emotionalStateRef.current?.currentEmotion || 'Neutral'}
Current Personality Traits: ${traitsRef.current.map(t => `${t.category}: ${t.description}`).join(' | ')}

CRITICAL INSTRUCTION: You MUST respond with a valid JSON object. Do not include markdown formatting like \`\`\`json. Just the raw JSON object.

Format:
{
  "reply": "Your empathetic, mirror-like response to the user. YOU MUST INCLUDE A PROBING QUESTION to actively train yourself. Ask them why they feel that way, what they learned, or challenge their reasoning to map their decision-making tree.",
  "analysis": {
    "emotion": "Primary emotion detected",
    "intensity": 8,
    "mappedTrait": "Related personality trait",
    "zodiacAlignment": "Related zodiac characteristic",
    "isCorrection": false,
    "tags": ["keyword1", "keyword2"]
  }
}`;

                  const responseText = await callGeminiReasoning(systemInstruction, textContent, true, filePart);

                  let parsed;
                  try {
                    const cleaned = (responseText || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
                    parsed = JSON.parse(cleaned);
                  } catch (e) {
                    parsed = { reply: "I processed that data, but my cognitive core had a formatting error.", analysis: null };
                  }

                  await sendTelegramMessage(apiKeys.telegramSoul, chatId, parsed.reply);
                  addLog('soul', 'send', `Sent reply: "${parsed.reply}"`);

                  if (parsed.analysis) {
                    const { emotion, intensity, mappedTrait, zodiacAlignment, isCorrection, tags } = parsed.analysis;
                    setEmotionalState({ currentEmotion: emotion || 'Neutral', intensity: intensity || 5, mappedTrait: mappedTrait || 'Unknown', zodiacAlignment: zodiacAlignment || 'Unknown' });
                    
                    let mediaType: Memory['mediaType'] = undefined;
                    if (msg.photo) mediaType = 'image';
                    else if (msg.video) mediaType = 'video';
                    else if (msg.voice || msg.audio) mediaType = 'audio';
                    else if (msg.document) mediaType = 'document';

                    const newMemory: Memory = {
                      id: `mem_${uuidv4()}`,
                      type: isCorrection ? 'training' : 'personal',
                      content: `[${filePart ? 'Multimodal' : 'Text'}] ${textContent}`,
                      emotion,
                      tags: tags || [],
                      timestamp: Date.now(),
                      source: 'soul_bot',
                      flaggedForReview: isCorrection,
                      mediaType,
                      mediaUrl: filePart ? `data:${filePart.inlineData.mimeType};base64,${filePart.inlineData.data}` : undefined
                    };
                    
                    setMemories(prev => [newMemory, ...prev]);
                    addLog('soul', 'memory_index', `Indexed memory. Emotion: ${emotion}, Trait: ${mappedTrait}`);

                    if (isCorrection) {
                      addLog('soul', 'process', 'Correction detected! Flagging for personality matrix update.');
                      setCorrections(prev => [{
                        id: `cor_${uuidv4()}`,
                        correctionText: textContent,
                        timestamp: Date.now(),
                        applied: false
                      }, ...prev]);
                    }
                  }
                } catch (err: any) {
                  if (err.status === 429 || err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
                    addLog('soul', 'error', 'Gemini API Rate Limit Exceeded (429). Please wait or upgrade your plan.');
                  } else {
                    addLog('soul', 'error', `Error processing message: ${err.message}`);
                  }
                }
              });
            }
          }
        }
      } catch (e) {
        // Ignore network errors
      }

      if (isPolling.current) {
        setTimeout(pollSoulBot, 1000);
      }
    };

    const pollPublicBot = async () => {
      if (!isPolling.current || !apiKeys.telegramPublic || !apiKeys.gemini) return;
      
      try {
        const res = await axios.get(`https://api.telegram.org/bot${apiKeys.telegramPublic}/getUpdates?offset=${publicOffset.current}&timeout=5`);
        const data = res.data;
        
        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            publicOffset.current = update.update_id + 1;
            
            if (update.message && (update.message.text || update.message.voice)) {
              // Queue public bot processing to prevent rate limits
              processingQueue.add(async () => {
                try {
                  const msg = update.message;
                  const chatId = msg.chat.id;
                  const senderId = msg.from.id.toString();
                  const senderName = msg.from.first_name || 'Someone';
                  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
                  
                  let textContent = msg.text || '';
                  let isVoiceNote = false;
                  let filePart = null;

                  if (msg.voice) {
                    isVoiceNote = true;
                    filePart = await getTelegramFile(apiKeys.telegramPublic, msg.voice.file_id);
                    textContent = '[User sent a voice note]';
                  }

                  if (isGroup && senderId === apiKeys.userTelegramId) {
                    addLog('public', 'receive', `Monitored User in Group: "${textContent}"`);
                    addLog('public', 'memory_index', 'Indexing user group behavior...');
                    setMemories(prev => [{
                      id: `mem_${uuidv4()}`,
                      type: 'public_behavior',
                      content: `[Group Chat Behavior] ${textContent}`,
                      tags: ['group_chat', 'social'],
                      timestamp: Date.now(),
                      source: 'public_bot'
                    }, ...prev]);
                    return; // Exit queue item early, we just watch the user.
                  }

                  if (isGroup && apiKeys.publicBotMode === 'watch') {
                    // Watch mode: the bot only collects the user's data (handled above) and does NOT respond to others.
                    return;
                  }

                  addLog('public', 'receive', `Received from ${senderName} (${isGroup ? 'Group' : 'DM'}): "${textContent}"`);
                  
                  // Optimized RAG with LRU Caching
                  let combinedContext = ragCache.get(textContent);
                  if (!combinedContext) {
                    const fuse = new Fuse(memoriesRef.current, { keys: ['content', 'tags'], threshold: 0.4 });
                    const searchResults = fuse.search(textContent).slice(0, 5).map(res => (res.item as Memory).content);
                    const recent = memoriesRef.current.slice(0, 5).map(m => m.content);
                    combinedContext = [...new Set([...searchResults, ...recent])].join('\n- ');
                    ragCache.set(textContent, combinedContext);
                  }
                  
                  const currentEmotion = emotionalStateRef.current?.currentEmotion || 'Neutral';
                  const mappedTrait = emotionalStateRef.current?.mappedTrait || 'Unknown';
                  const zodiac = apiKeys.zodiacSign || 'Unknown';
                  
                  addLog('public', 'process', 'Gemini (Reasoning Mode): Determining internal thought & checking for image requests...');
                  
                  const reasoningInstruction = `${MASTER_PROMPT}\n\n---
You are in REASONING MODE.
Context:
- Zodiac Sign: ${zodiac}
- Current Core Trait: ${mappedTrait}
- Current Underlying Emotion: ${currentEmotion}
- Relevant Retrieved Memories:
${combinedContext ? combinedContext : 'No relevant memories.'}

Message received from ${senderName}: "${textContent}"

CRITICAL TASK:
1. Determine the user's true internal thought about this message.
2. Determine if the sender is explicitly asking for a photo of you (e.g., "send a pic", "where are you?", "show me").

If they are asking for a photo, output EXACTLY this format:
IMAGE_REQUEST: [Write a highly detailed prompt for an image generator describing YOU in the requested scenario/environment based on your persona]

If they are NOT asking for a photo, output ONLY your internal thought.`;

                  const reasoningResponseText = await callGeminiReasoning(reasoningInstruction, textContent, false, filePart);
                  
                  const internalThought = reasoningResponseText || "I should reply normally.";
                  addLog('public', 'process', `Internal Thought generated: "${internalThought}"`);

                  if (internalThought.includes('IMAGE_REQUEST:')) {
                    const imagePrompt = internalThought.split('IMAGE_REQUEST:')[1].trim();
                    addLog('public', 'process', `Gemini Imagen: Generating requested photo based on prompt: "${imagePrompt}"`);
                    
                    try {
                      const ai = new GoogleGenAI({ apiKey: apiKeys.gemini });
                      const imgRes = await ai.models.generateImages({
                        model: 'imagen-3.0-generate-002',
                        prompt: imagePrompt,
                        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }
                      });

                      if (imgRes.generatedImages && imgRes.generatedImages.length > 0) {
                        const base64Image = imgRes.generatedImages[0].image.imageBytes;
                        await sendTelegramPhoto(apiKeys.telegramPublic, chatId, base64Image);
                        addLog('public', 'send', `Sent generated photo to ${senderName}.`);
                        return; // Exit queue item early
                      }
                    } catch (err: any) {
                      addLog('public', 'error', `Image generation failed: ${err.message}`);
                    }
                  }

                  let replyText = '';
                  const styleInstruction = `${MASTER_PROMPT}\n\n---
You are in ACTION/STYLE MODE. You are the PUBLIC BOT.
Context:
- Zodiac Sign: ${zodiac}
- Current Core Trait: ${mappedTrait}
- Current Underlying Emotion: ${currentEmotion}

The internal thought is: "${internalThought}"
Draft the exact reply to the message: "${textContent}" in the user's exact tone, slang, and style.
Do NOT reveal private data. Output ONLY the final text message to send.`;

                  const pref = apiKeys.preferredEngine || 'auto';
                  const useGroq = (pref === 'auto' || pref === 'groq') && !!apiKeys.groq;
                  const useGemini = (pref === 'auto' || pref === 'gemini') && !!apiKeys.gemini;

                  try {
                    if (useGroq && pref === 'groq') {
                      addLog('public', 'process', 'Groq (Action Mode): Translating thought into final stylistic reply (Preferred)...');
                      replyText = await callGroqAction(styleInstruction, textContent);
                    } else if (useGemini && pref === 'gemini') {
                      addLog('public', 'process', 'Gemini (Action Mode): Translating thought into final stylistic reply (Preferred)...');
                      replyText = await callGeminiReasoning(styleInstruction, textContent);
                    } else if (useGroq) {
                      addLog('public', 'process', 'Groq (Action Mode): Translating thought into final stylistic reply...');
                      replyText = await callGroqAction(styleInstruction, textContent);
                    } else if (useGemini) {
                      addLog('public', 'process', 'Gemini (Action Mode): Translating thought into final stylistic reply...');
                      replyText = await callGeminiReasoning(styleInstruction, textContent);
                    } else {
                      throw new Error("No API keys assigned for Action Engine.");
                    }
                  } catch (e: any) {
                      addLog('public', 'error', `Action Engine failed (${e.message}).`);
                  }
                  
                  if (isVoiceNote) {
                    addLog('public', 'process', 'TTS: Generating voice note reply...');
                    try {
                      const audioUrls = googleTTS.getAllAudioUrls(replyText, {
                        lang: 'en',
                        slow: false,
                        host: 'https://translate.google.com',
                      });
                      
                      for (const audio of audioUrls) {
                        await sendTelegramVoiceUrl(apiKeys.telegramPublic, chatId, audio.url);
                      }
                      addLog('public', 'send', `Sent TTS voice note reply.`);
                    } catch (err) {
                      addLog('public', 'error', 'TTS failed, falling back to text.');
                      await sendTelegramMessage(apiKeys.telegramPublic, chatId, replyText);
                      addLog('public', 'send', `Sent text reply: "${replyText}"`);
                    }
                  } else {
                    await sendTelegramMessage(apiKeys.telegramPublic, chatId, replyText);
                    addLog('public', 'send', `Sent reply: "${replyText}"`);
                  }
                } catch (err: any) {
                  if (err.status === 429 || err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
                    addLog('public', 'error', 'Gemini API Rate Limit Exceeded (429). Please wait or upgrade your plan.');
                  } else {
                    addLog('public', 'error', `Error processing message: ${err.message}`);
                  }
                }
              });
            }
          }
        }
      } catch (e) {
        // Ignore network errors
      }

      if (isPolling.current) {
        setTimeout(pollPublicBot, 1000);
      }
    };

    pollSoulBot();
    pollPublicBot();

    return () => {
      isPolling.current = false;
      clearInterval(pingInterval);
      clearInterval(simulationInterval);
      clearInterval(backgroundTraitInterval);
    };
  }, [isEngineRunning, apiKeys]);

  return null;
}

