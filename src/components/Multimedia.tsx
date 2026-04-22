import React, { useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Upload, Image as ImageIcon, Video, FileAudio, FileText, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { analyzeImage, extractPdfText } from '../engine/MediaProcessor';
import { GoogleGenAI } from '@google/genai';

export default function Multimedia() {
  const { apiKeys, memories, setMemories } = useAppContext();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaMemories = memories.filter(m => m.mediaUrl);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files: FileList) => {
    setIsProcessing(true);
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      
      const fileData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (file.type.startsWith('image/')) mediaType = 'image';
      else if (file.type.startsWith('video/')) mediaType = 'video';
      else if (file.type.startsWith('audio/')) mediaType = 'audio';

      const base64Data = fileData.split(',')[1];
      let analysis = '';

      const isGeminiSupported = (mime: string) => {
        return mime.startsWith('image/') || 
               mime.startsWith('video/') || 
               mime.startsWith('audio/') || 
               mime === 'application/pdf' || 
               mime.startsWith('text/');
      };

      if (apiKeys.gemini) {
        if (isGeminiSupported(file.type)) {
          try {
            const ai = new GoogleGenAI({ apiKey: apiKeys.gemini });
            const res = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [
                { text: `Extract all relevant context, text, visual details, audio transcripts, and implicit meaning from this file. Output a clear, highly detailed summary of what this is.` },
                { inlineData: { data: base64Data, mimeType: file.type } }
              ]
            });
            analysis = res.text || '';
            
            // Also append local OCR/PDF text just in case Gemini summarized but missed exact strings
            if (mediaType === 'image') {
              const localAnalysis = await analyzeImage(base64Data, file.type);
              analysis += `\n\n[Local Heuristics Context]: ${localAnalysis}`;
            } else if (file.type === 'application/pdf') {
              const localText = await extractPdfText(base64Data);
              analysis += `\n\n[Local PDF Extraction Context]: ${localText.substring(0, 500)}...`;
            }
          } catch (e: any) {
            console.error("Gemini Multi-modal extraction failed, falling back to local processing", e);
            if (mediaType === 'image') {
              analysis = await analyzeImage(base64Data, file.type);
            } else if (file.type === 'application/pdf') {
              analysis = await extractPdfText(base64Data);
            } else {
              analysis = `[Gemini extraction failed: ${e.message}]`;
            }
          }
        } else {
          // Fallback for unsupported mime types
          analysis = `[File type ${file.type} is not natively readable by Gemini. Manual context required.]`;
        }
      } else {
        if (mediaType === 'image') {
          analysis = await analyzeImage(base64Data, file.type);
        } else if (file.type === 'application/pdf') {
          analysis = await extractPdfText(base64Data);
        } else {
          analysis = "[Requires Gemini API key for Audio/Video Deep Extraction]";
        }
      }

      const newMemory = {
        id: `mem_${uuidv4()}`,
        type: 'personal' as const,
        content: `[Manual Upload: ${file.name}]\n${analysis}`,
        tags: ['multimedia', mediaType],
        timestamp: Date.now(),
        source: 'manual_upload' as const,
        mediaUrl: fileData,
        mediaType
      };

      setMemories(prev => [newMemory, ...prev]);
    }
    setIsProcessing(false);
  };

  const deleteMedia = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const getIcon = (type?: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-8 h-8 text-blue-400" />;
      case 'video': return <Video className="w-8 h-8 text-purple-400" />;
      case 'audio': return <FileAudio className="w-8 h-8 text-green-400" />;
      default: return <FileText className="w-8 h-8 text-gray-400" />;
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Multimedia Ingestion Core</h2>
          <p className="text-sm text-gray-400 mt-1">Directly inject images, videos, audio, and documents into your digital consciousness.</p>
        </div>
      </div>

      <div 
        className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-colors cursor-pointer ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          multiple 
          accept="image/*,video/*,audio/*,.pdf,.txt,.csv,.doc,.docx"
          onChange={handleFileInput}
          disabled={isProcessing}
        />
        {isProcessing ? (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 mb-4 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-lg font-medium text-blue-400">Processing Media...</p>
            <p className="text-sm text-gray-500 mt-2">Extracting text and facial features</p>
          </div>
        ) : (
          <>
            <Upload className={`w-12 h-12 mb-4 ${isDragging ? 'text-blue-400' : 'text-gray-500'}`} />
            <p className="text-lg font-medium text-gray-300">Drag & drop files here</p>
            <p className="text-sm text-gray-500 mt-2">or click to browse</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {mediaMemories.map(memory => (
          <div key={memory.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden relative group">
            <button 
              onClick={() => deleteMedia(memory.id)}
              className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <X className="w-4 h-4 text-white" />
            </button>
            
            <div className="aspect-video bg-gray-900 flex items-center justify-center overflow-hidden">
              {memory.mediaType === 'image' && memory.mediaUrl ? (
                <img src={memory.mediaUrl} alt={memory.content} className="w-full h-full object-cover" />
              ) : memory.mediaType === 'video' && memory.mediaUrl ? (
                <video src={memory.mediaUrl} className="w-full h-full object-cover" controls />
              ) : memory.mediaType === 'audio' && memory.mediaUrl ? (
                <audio src={memory.mediaUrl} className="w-full" controls />
              ) : (
                getIcon(memory.mediaType)
              )}
            </div>
            
            <div className="p-4">
              <p className="text-sm font-medium text-gray-200 truncate">{memory.content.replace('[Manual Upload] ', '')}</p>
              <p className="text-xs text-gray-500 mt-1">{new Date(memory.timestamp).toLocaleString()}</p>
            </div>
          </div>
        ))}
        
        {mediaMemories.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-500">
            <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
            <p>No multimedia memories ingested yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
