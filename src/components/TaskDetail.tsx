/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  AlertTriangle, 
  CheckSquare, 
  Square, 
  Flame, 
  Trash2, 
  Play, 
  CheckCircle2, 
  Sparkles, 
  Clock,
  Layers,
  CheckCircle
} from 'lucide-react';
import { Task, UserStats, ChecklistItem } from '../types';
import { calculateLivePriorityScore, getPriorityBadge } from '../utils/priority';
import { db, doc, updateDoc, deleteDoc } from '../firebase';

interface TaskDetailProps {
  taskId: string;
  tasks: Task[];
  stats: UserStats | null;
  onNavigate: (screen: string, taskId?: string) => void;
}

export default function TaskDetail({ taskId, tasks, stats, onNavigate }: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [countdownStr, setCountdownStr] = useState('');
  const [loadingRescue, setLoadingRescue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load active task details
  useEffect(() => {
    const currentTask = tasks.find(t => t.id === taskId);
    if (currentTask) {
      setTask(currentTask);
    }
  }, [tasks, taskId]);

  // Periodic countdown updates
  useEffect(() => {
    if (!task || task.status === 'completed') return;

    const updateCountdown = () => {
      const deadlineTime = new Date(task.deadline).getTime();
      const msDiff = deadlineTime - Date.now();
      
      if (msDiff <= 0) {
        setCountdownStr('Overdue');
        return;
      }

      const hours = Math.floor(msDiff / (1000 * 60 * 60));
      const mins = Math.floor((msDiff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 0) {
        setCountdownStr(`${hours}h ${mins}m remaining`);
      } else {
        setCountdownStr(`${mins}m remaining`);
      }

      // 4. Automatic Rescue Mode Trigger:
      // When a task has less than 3 hours left, status is not_started/in_progress,
      // and it does not already have a rescue checklist, automatically trigger Rescue Mode!
      const hoursRemaining = msDiff / (1000 * 60 * 60);
      if (hoursRemaining < 3 && task.status !== 'rescue_mode' && !task.rescueChecklist) {
        triggerAutomaticRescue(task, hoursRemaining);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 10000);
    return () => clearInterval(interval);
  }, [task]);

  const triggerAutomaticRescue = async (activeTask: Task, hoursLeft: number) => {
    try {
      console.log('Automatically triggering rescue mode for:', activeTask.title);
      setLoadingRescue(true);
      setError(null);

      // Call Express server API route to generate checklist
      const response = await fetch('/api/tasks/rescue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeTask.title,
          category: activeTask.category,
          estimatedEffortMinutes: activeTask.estimatedEffortMinutes,
          hoursRemaining: hoursLeft
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to parse rescue response');
      }

      const checklist: ChecklistItem[] = await response.json();

      // Write Rescue state and checklist back to firestore
      const taskRef = doc(db, 'tasks', activeTask.id);
      await updateDoc(taskRef, {
        status: 'rescue_mode',
        rescueChecklist: checklist
      });
    } catch (err: any) {
      console.error('Error generating rescue plan:', err);
      setError('Gemini API call failed. Could not auto-generate Rescue checklist.');
    } finally {
      setLoadingRescue(false);
    }
  };

  const handleManualRescueClick = async () => {
    if (!task) return;
    const deadlineTime = new Date(task.deadline).getTime();
    const hoursRemaining = (deadlineTime - Date.now()) / (1000 * 60 * 60);
    await triggerAutomaticRescue(task, hoursRemaining > 0 ? hoursRemaining : 2);
  };

  const handleStatusChange = async (newStatus: Task['status']) => {
    if (!task) return;
    try {
      const taskRef = doc(db, 'tasks', task.id);
      const updates: Partial<Task> = { status: newStatus };

      if (newStatus === 'completed') {
        updates.completedAt = new Date().toISOString();
        
        // On-time streak check
        const isBeforeDeadline = new Date().getTime() <= new Date(task.deadline).getTime();
        if (isBeforeDeadline && stats) {
          const userStatsRef = doc(db, 'userStats', task.userId);
          await updateDoc(userStatsRef, {
            streakCount: (stats.streakCount || 0) + 1,
            lastCompletedAt: new Date().toISOString(),
            totalCompletedOnTime: (stats.totalCompletedOnTime || 0) + 1,
            totalCompleted: (stats.totalCompleted || 0) + 1
          });
        } else if (stats) {
          const userStatsRef = doc(db, 'userStats', task.userId);
          await updateDoc(userStatsRef, {
            lastCompletedAt: new Date().toISOString(),
            totalCompleted: (stats.totalCompleted || 0) + 1
          });
        }
      }

      await updateDoc(taskRef, updates);
    } catch (err) {
      console.error('Error modifying status:', err);
    }
  };

  const handleChecklistToggle = async (itemId: string) => {
    if (!task || !task.rescueChecklist) return;

    const updatedChecklist = task.rescueChecklist.map(item => {
      if (item.id === itemId) {
        return { ...item, completed: !item.completed };
      }
      return item;
    });

    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        rescueChecklist: updatedChecklist
      });
    } catch (err) {
      console.error('Error updating checklist:', err);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    try {
      await deleteDoc(doc(db, 'tasks', task.id));
      onNavigate('dashboard');
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  if (!task) {
    return (
      <div className="text-center py-12" id="detail-not-found">
        <p className="text-slate-400 text-sm">Searching for objective database coordinates...</p>
      </div>
    );
  }

  const livePriority = calculateLivePriorityScore(task);
  const badge = getPriorityBadge(livePriority);
  const isCompleted = task.status === 'completed';
  const isRescueMode = task.status === 'rescue_mode';

  // Checklist progress
  const rescueItemsCount = task.rescueChecklist?.length || 0;
  const rescueItemsCompleted = task.rescueChecklist?.filter(i => i.completed).length || 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-1" id="task-detail-container">
      {/* Back CTA */}
      <button
        onClick={() => onNavigate('dashboard')}
        className="text-slate-500 hover:text-slate-800 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        id="btn-back-dashboard"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      {/* Task Header info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 relative overflow-hidden shadow-xs" id="task-detail-core-card">
        {isRescueMode && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500"></div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2" id="detail-badges">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200/60">
              {task.category}
            </span>
            {!isCompleted && (
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${badge.bg} ${badge.color} ${badge.border}`}>
                {badge.label} ({livePriority})
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 font-mono" id="created-date">
            Discovered: {new Date(task.createdAt).toLocaleDateString()}
          </div>
        </div>

        <h1 className={`text-xl md:text-2xl font-bold font-display ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`} id="detail-title">
          {task.title}
        </h1>

        {/* Dynamic Timeline Countdown Block */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl ${
          isCompleted 
            ? 'bg-emerald-50 border border-emerald-200' 
            : isRescueMode 
            ? 'bg-rose-50 border border-rose-200' 
            : 'bg-slate-50 border border-slate-200'
        }`} id="detail-meta-dashboard">
          <div className="flex items-center gap-3">
            <Clock className={`w-5 h-5 ${isCompleted ? 'text-emerald-600' : isRescueMode ? 'text-rose-600' : 'text-indigo-600'}`} />
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Deadline countdown</span>
              <span className={`text-xs md:text-sm font-semibold ${isCompleted ? 'text-emerald-600' : isRescueMode ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
                {isCompleted ? 'Completed On Time!' : countdownStr}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Target effort duration</span>
              <span className="text-xs md:text-sm font-semibold text-slate-700 font-mono">
                {task.estimatedEffortMinutes} minutes active focus
              </span>
            </div>
          </div>
        </div>

        {/* Status Manual Stepper control */}
        <div className="space-y-2 pt-2" id="status-stepper-control">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Manual Status Phase</label>
          <div className="grid grid-cols-3 gap-2" id="stepper-buttons-row">
            <button
              onClick={() => handleStatusChange('not_started')}
              disabled={isCompleted}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                task.status === 'not_started'
                  ? 'bg-slate-800 border-slate-700 text-white shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              Ready
            </button>
            <button
              onClick={() => handleStatusChange('in_progress')}
              disabled={isCompleted}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                task.status === 'in_progress'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => handleStatusChange('completed')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                task.status === 'completed'
                  ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              Completed
            </button>
          </div>
        </div>
      </div>

      {/* Panic manual trigger if not in Rescue Mode */}
      {!isRescueMode && !isCompleted && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs" id="panic-button-box">
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              Panic Zone Intervention
            </h4>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Feeling overwhelmed? Engage Gemini to dissect this goal into an immediate, bite-sized rescue checklist.
            </p>
          </div>
          <button
            onClick={handleManualRescueClick}
            disabled={loadingRescue}
            className="flex-shrink-0 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
            id="btn-panic-rescue"
          >
            {loadingRescue ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Dissecting...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Dissect with Gemini
              </>
            )}
          </button>
        </div>
      )}

      {/* Rescue Mode Highlights Card */}
      <AnimatePresence>
        {isRescueMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-rose-50/60 border border-rose-200/80 rounded-2xl p-6 space-y-4 shadow-sm relative overflow-hidden"
            id="rescue-mode-box"
          >
            <div className="absolute top-[-30px] right-[-30px] w-24 h-24 bg-rose-500/5 rounded-full blur-xl pointer-events-none"></div>

            <div className="flex items-center justify-between pb-2 border-b border-rose-200" id="rescue-mode-header">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                <h3 className="text-sm font-black text-rose-600 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-rose-500" />
                  Rescue Checklist Active
                </h3>
              </div>
              <span className="text-[10px] font-mono text-rose-750 font-bold bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full">
                {rescueItemsCompleted} / {rescueItemsCount} Salvaged
              </span>
            </div>

            <p className="text-rose-900 text-xs leading-relaxed font-medium" id="rescue-advice-intro">
              🎯 <strong>ZeroHour Crisis Intervention:</strong> The clock is running dry. Discard all secondary deliverables. Concentrate fully on executing this hyper-minimal MVP route generated by Gemini:
            </p>

            {/* Checklist elements */}
            <div className="space-y-3 pt-1" id="rescue-checklist-items">
              {task.rescueChecklist?.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleChecklistToggle(item.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    item.completed 
                      ? 'bg-emerald-50 border-emerald-200/60 opacity-80' 
                      : 'bg-white border-rose-200/60 hover:border-rose-300 shadow-xs'
                  }`}
                  id={`checklist-row-${item.id}`}
                >
                  <button
                    type="button"
                    className={`mt-0.5 w-4.5 h-4.5 rounded flex items-center justify-center transition-all ${
                      item.completed 
                        ? 'bg-emerald-500 text-white' 
                        : 'border border-rose-200 hover:border-indigo-600 bg-white'
                    }`}
                  >
                    {item.completed && <CheckCircle className="w-3 h-3 stroke-[3]" />}
                  </button>
                  <div className="min-w-0">
                    <h4 className={`text-xs font-semibold leading-none ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {item.title}
                    </h4>
                    {item.instruction && (
                      <p className={`text-[11px] mt-1 leading-normal ${item.completed ? 'text-slate-400' : 'text-slate-600'}`}>
                        {item.instruction}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {rescueItemsCount > 0 && (
              <div className="pt-2" id="rescue-progress-bar-wrapper">
                <div className="w-full bg-rose-100 h-1.5 rounded-full overflow-hidden border border-rose-200/50">
                  <div 
                    className="h-full bg-gradient-to-r from-rose-500 to-orange-400 rounded-full transition-all duration-300" 
                    style={{ width: `${(rescueItemsCompleted / rescueItemsCount) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete / Dismiss Section */}
      <div className="pt-4 border-t border-slate-200 flex justify-between" id="detail-card-actions">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="px-4 py-2 hover:bg-rose-50 hover:text-rose-600 text-slate-400 border border-transparent hover:border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          id="btn-delete-task"
        >
          <Trash2 className="w-4 h-4" />
          Dismiss Objective
        </button>
      </div>

      {/* Custom Confirmation Modal */}
      {showDeleteConfirm && task && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" id="detail-delete-confirmation-modal">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 relative text-left"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-slate-900 font-bold text-lg mb-1">Dismiss Objective?</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Are you sure you want to permanently dismiss <span className="font-semibold text-slate-800">"{task.title}"</span>? This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                id="btn-cancel-detail-delete"
              >
                No, Keep It
              </button>
              <button
                onClick={async () => {
                  await handleDelete();
                  setShowDeleteConfirm(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                id="btn-confirm-detail-delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Yes, Dismiss
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
