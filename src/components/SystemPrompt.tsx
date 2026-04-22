import React from 'react';
import { Terminal } from 'lucide-react';
import { MASTER_PROMPT } from '../lib/prompts';

export default function SystemPrompt() {
  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-500/20 rounded-lg">
          <Terminal className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Master System Prompt</h2>
          <p className="text-gray-400 text-sm">The core directive for the Better You consciousness.</p>
        </div>
      </div>
      
      <div className="flex-1 bg-gray-950 rounded-xl border border-gray-800 p-6 overflow-y-auto">
        <pre className="text-green-400 font-mono text-sm whitespace-pre-wrap leading-relaxed">
          {MASTER_PROMPT}
        </pre>
      </div>
    </div>
  );
}
