/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  Wand2, 
  Clock, 
  Sparkles, 
  Calendar, 
  Layers, 
  Check, 
  AlertCircle,
  HelpCircle,
  Volume2
} from 'lucide-react';
import { db, collection, doc, setDoc } from '../firebase';
import { Task } from '../types';

interface AddTaskProps {
  userId: string;
  onNavigate: (screen: string, taskId?: string) => void;
}

// Add types for Web Speech API in TypeScript
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
  };
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: () => void;
  onend: () => void;
  onerror: (event: { error: string }) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
}

export default function AddTask({ userId, onNavigate }: AddTaskProps) {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parsed draft state from Gemini
  const [parsedDraft, setParsedDraft] = useState<{
    title: string;
    deadline: string;
    estimatedEffortMinutes: number;
    category: string;
    priorityScore: number;
    parsingMethod?: 'gemini' | 'fallback';
  } | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Recommended prompt triggers
  const SUGGESTIONS = [
    "submit the report by Friday 5pm, it's a big one.",
    "complete presentation slides in 3 hours, high importance.",
    "quick check-in call tomorrow 10am.",
    "finish the design mockups by midnight, will take about 2 hours."
  ];

  useEffect(() => {
    // Check Speech Recognition support
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSpeechSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsRecording(true);
        setError(null);
      };

      rec.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
      };

      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e.error);
        if (e.error === 'not-allowed') {
          setError('Microphone access denied. Enable permissions in your browser.');
        } else {
          setError(`Speech error: ${e.error}`);
        }
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const handleMicToggle = () => {
    if (!speechSupported) {
      setError('Speech Recognition is not supported on this browser. Try Chrome/Safari.');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      setInputText('');
      recognitionRef.current?.start();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputText(suggestion);
  };

  const handleParseTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setLoading(true);
    setError(null);
    setParsedDraft(null);

    try {
      const response = await fetch('/api/tasks/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: inputText,
          currentTime: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'AI parsing error');
      }

      const data = await response.json();
      setParsedDraft({
        title: data.title || 'Untitled Objective',
        deadline: data.deadline || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        estimatedEffortMinutes: data.estimatedEffortMinutes || 60,
        category: data.category || 'Work',
        priorityScore: data.priorityScore || 50,
        parsingMethod: data.parsingMethod || 'fallback'
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Connecting with Gemini failed. Verify API key in secrets.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAndSave = async () => {
    if (!parsedDraft) return;

    setLoading(true);
    try {
      const tasksCollection = collection(db, 'tasks');
      const newTaskDoc = doc(tasksCollection); // Auto generate ID
      const newTask: Task = {
        id: newTaskDoc.id,
        userId: userId,
        title: parsedDraft.title,
        deadline: parsedDraft.deadline,
        estimatedEffortMinutes: parsedDraft.estimatedEffortMinutes,
        category: parsedDraft.category,
        priorityScore: parsedDraft.priorityScore,
        status: 'not_started',
        rescueChecklist: null,
        completedAt: null,
        createdAt: new Date().toISOString()
      };

      await setDoc(newTaskDoc, newTask);
      // Clean up and route back to dashboard
      setInputText('');
      setParsedDraft(null);
      onNavigate('dashboard');
    } catch (err: any) {
      console.error('Error saving task to Firestore:', err);
      setError('Failed to save task to database.');
    } finally {
      setLoading(false);
    }
  };

  const formatPreviewDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-1" id="add-task-container">
      {/* Title */}
      <div id="add-task-title-section">
        <h1 className="text-2xl font-bold font-display tracking-tight text-slate-800 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          Dictate Your Objective
        </h1>
        <p className="text-slate-500 text-xs mt-1">
          Type or speak. Describe deadlines, relative timelines, and size details. Gemini does the parsing.
        </p>
      </div>

      {/* Dictation Box */}
      <form onSubmit={handleParseTask} className="space-y-4" id="add-task-form">
        <div className="relative" id="dictate-input-wrapper">
          <textarea
            id="task-input-textarea"
            rows={4}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder='e.g., "Review deck for the pitch tomorrow at 9 AM, it is critical and will take 2 hours..."'
            className="w-full bg-white border border-slate-200 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 rounded-2xl p-4 text-sm text-slate-800 placeholder-slate-400 resize-none pr-12 leading-relaxed transition-all shadow-xs"
            disabled={loading}
          />
          
          {/* Micro Button */}
          <button
            type="button"
            id="btn-microphone-toggle"
            onClick={handleMicToggle}
            disabled={loading}
            className={`absolute right-4 bottom-4 p-2.5 rounded-full transition-all ${
              isRecording 
                ? 'bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/20' 
                : 'bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200'
            }`}
            title={isRecording ? 'Listening... click to stop' : 'Start voice transcription'}
          >
            {isRecording ? <Volume2 className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        {/* Live Audio Waves indicator */}
        {isRecording && (
          <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 py-2 px-3 rounded-lg border border-rose-200 animate-pulse justify-center" id="voice-waves">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            <span>Recording live audio... Speak clearly now</span>
          </div>
        )}

        {/* Suggestions */}
        <div className="space-y-2" id="suggestions-block">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            Suggested Prompt Triggers
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2" id="suggestions-grid">
            {SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                type="button"
                id={`suggestion-btn-${idx}`}
                onClick={() => handleSuggestionClick(s)}
                className="text-left text-xs bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-indigo-600 p-2.5 rounded-xl transition-all truncate shadow-xs"
              >
                "{s}"
              </button>
            ))}
          </div>
        </div>

        {/* Form CTA */}
        <div className="flex justify-end pt-2" id="form-action-section">
          <button
            type="submit"
            id="btn-submit-parse"
            disabled={loading || !inputText.trim()}
            className="w-full md:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing timeline...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Engage Gemini Parser
              </>
            )}
          </button>
        </div>
      </form>

      {/* Error Output */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 flex items-start gap-2 animate-shake" id="error-alert">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Parsed Preview Card */}
      <AnimatePresence>
        {parsedDraft && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-md relative overflow-hidden"
            id="parsed-preview-card"
          >
            <div className="absolute top-0 right-0 p-3" id="preview-tag">
              <span className="text-[10px] font-mono font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Parsed Objective Draft
              </span>
            </div>

            {parsedDraft.parsingMethod === 'fallback' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 flex items-start gap-2.5 shadow-xs" id="fallback-parsing-notice">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                <span className="leading-relaxed">
                  Using basic parsing — add <strong>GEMINI_API_KEY</strong> in Settings &gt; Secrets for smarter results.
                </span>
              </div>
            )}

            <div className="space-y-1">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Title</h3>
              <input 
                type="text" 
                value={parsedDraft.title}
                onChange={(e) => setParsedDraft({ ...parsedDraft, title: e.target.value })}
                className="text-lg font-bold text-slate-800 bg-slate-50/50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl px-3 py-1.5 w-full text-sm outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> Category
                </label>
                <input 
                  type="text" 
                  value={parsedDraft.category}
                  onChange={(e) => setParsedDraft({ ...parsedDraft, category: e.target.value })}
                  className="bg-slate-50/50 border border-slate-200 focus:border-indigo-600 focus:bg-white text-slate-700 rounded-xl px-3 py-1.5 w-full text-xs outline-none"
                />
              </div>

              {/* Deadline */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Deadline (ISO 8601)
                </label>
                <input 
                  type="text" 
                  value={parsedDraft.deadline}
                  onChange={(e) => setParsedDraft({ ...parsedDraft, deadline: e.target.value })}
                  className="bg-slate-50/50 border border-slate-200 focus:border-indigo-600 focus:bg-white text-slate-700 rounded-xl px-3 py-1.5 w-full text-xs font-mono outline-none"
                />
                <span className="text-[10px] text-indigo-600 block pl-1">
                  Parsed: {formatPreviewDate(parsedDraft.deadline)}
                </span>
              </div>

              {/* Effort */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Est Effort (Minutes)
                </label>
                <input 
                  type="number" 
                  value={parsedDraft.estimatedEffortMinutes}
                  onChange={(e) => setParsedDraft({ ...parsedDraft, estimatedEffortMinutes: parseInt(e.target.value) || 0 })}
                  className="bg-slate-50/50 border border-slate-200 focus:border-indigo-600 focus:bg-white text-slate-700 rounded-xl px-3 py-1.5 w-full text-xs font-mono outline-none"
                />
              </div>

              {/* Priority */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Gemini Priority Score (0-100)
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    type="range" 
                    min="0" 
                    max="100"
                    value={parsedDraft.priorityScore}
                    onChange={(e) => setParsedDraft({ ...parsedDraft, priorityScore: parseInt(e.target.value) || 0 })}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="font-mono text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                    {parsedDraft.priorityScore}
                  </span>
                </div>
              </div>
            </div>

            {/* Commit CTA */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100" id="preview-save-actions">
              <button
                type="button"
                id="btn-cancel-draft"
                onClick={() => setParsedDraft(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                id="btn-confirm-draft"
                onClick={handleConfirmAndSave}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Commit to Calendar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
