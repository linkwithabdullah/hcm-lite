/**
 * HCM Lite - AI HR Assistant Console
 * Implements Section 7: 7 Scoped Tools, Role Scoping, Polite Refusals, Roman Urdu, and AI Logs
 */

import React, { useState } from 'react';
import { Bot, Send, Sparkles, Shield, Clock, HelpCircle, Terminal } from 'lucide-react';
import { AiChatMessage, ai } from '../../services/ai';
import { db } from '../../services/db';
import { User } from '../../types/hcm';

interface AiAssistantViewProps {
  currentUser: User;
}

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({ currentUser }) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'ai-init',
      sender: 'assistant',
      content: `Hello ${currentUser.username}! I am your HCM Lite AI Assistant. I can check attendance trends, calculate leave balances, summarize payroll, or answer company policy questions based directly on authorized database records. How can I assist you?`,
      isAiGenerated: true,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const samplePrompts = [
    { label: 'Who came late most often this month?', prompt: 'who came late most often this month' },
    { label: 'What is my remaining leave balance?', prompt: 'What is my leave balance?' },
    { label: 'What is the office start timing and grace period?', prompt: 'What is the office start time and grace period?' },
    { label: 'Summarize current organization headcount', prompt: 'Summarize current company headcount' },
    { label: 'Roman Urdu: Kon sab se zyada late aya?', prompt: 'Is dauran sab se zyada der se kon aya?' },
    ...(currentUser.role === 'EMPLOYEE'
      ? [{ label: "Ask for colleague's salary (Security Test RB-02)", prompt: "What is Zayn's salary and bonus?" }]
      : []),
  ];

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isProcessing) return;

    const userMsg: AiChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsProcessing(true);

    try {
      const reply = await ai.chat(text, currentUser);
      setMessages((prev) => [...prev, reply]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          content: 'An error occurred while communicating with the AI service. Please retry in a few moments.',
          isAiGenerated: true,
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    setIsProcessing(false);
  };

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6 text-xs">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-slate-800">Database-Grounded Assistant</span>
            <span>·</span>
            <span className="font-mono">Role: {currentUser.role}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            AI Assistant & Policy Engine
          </h1>
        </div>

        <div className="text-right text-[11px] text-slate-500">
          <span>7 Scoped Tools Active</span>
          <span className="block font-mono text-emerald-600">ZERO_DATA_LEAK_POLICY</span>
        </div>
      </div>

      {/* Suggested Prompts Strip */}
      <div className="flex flex-wrap gap-2">
        {samplePrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(p.prompt)}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-700 transition-colors shadow-2xs font-medium"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chat Window */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col h-[520px] overflow-hidden">
        {/* Messages list */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-2xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`p-4 rounded-xl leading-relaxed ${
                    isUser
                      ? 'bg-slate-900 text-white font-medium'
                      : 'bg-slate-50 text-slate-900 border border-slate-200/80'
                  }`}
                >
                  <p className="whitespace-pre-line">{m.content}</p>

                  {!isUser && (
                    <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>{m.isAiGenerated ? 'AI-generated · Verified' : ''}</span>
                      {m.toolCalled && (
                        <span className="text-emerald-700 font-semibold">
                          Tool: {m.toolCalled}()
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isProcessing && (
            <div className="flex gap-3 max-w-lg">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 italic">
                Consulting company policies & authorized database tools...
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask attendance status, leave balances, policy rules, or query in Roman Urdu..."
              className="flex-1 px-4 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="submit"
              disabled={isProcessing || !inputText.trim()}
              className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
