/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  Flame, 
  Clock, 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle, 
  Plus, 
  Trash, 
  ChevronRight,
  Zap,
  CheckCircle2,
  PlayCircle,
  Sparkles
} from 'lucide-react';
import { Task, UserStats } from '../types';
import { calculateLivePriorityScore, getPriorityBadge } from '../utils/priority';
import { db, doc, updateDoc, deleteDoc } from '../firebase';

interface DashboardProps {
  tasks: Task[];
  stats: UserStats | null;
  onNavigate: (screen: string, taskId?: string) => void;
}

export default function Dashboard({ tasks, stats, onNavigate }: DashboardProps) {
  const [liveTasks, setLiveTasks] = useState<Task[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const fetchAndCacheSummary = async (force = false) => {
    if (!stats || !stats.userId) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const response = await fetch('/api/tasks/focus-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks })
      });
      if (!response.ok) {
        throw new Error('Failed to generate daily advisor summary');
      }
      const data = await response.json();
      const newSummary = data.summary;
      
      // Cache in firestore under userStats
      const statsDocRef = doc(db, 'userStats', stats.userId);
      await updateDoc(statsDocRef, {
        focusSummary: newSummary,
        focusSummaryUpdatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setSummaryError(err.message || 'Error compiling daily plan.');
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!stats || !stats.userId) return;
    
    const checkSummaryDate = () => {
      // If force is not requested, check if we have a valid summary for today
      if (!stats.focusSummary) {
        fetchAndCacheSummary();
        return;
      }
      
      if (!stats.focusSummaryUpdatedAt) {
        fetchAndCacheSummary();
        return;
      }

      // Check if it's the same calendar day
      const lastUpdate = new Date(stats.focusSummaryUpdatedAt);
      const now = new Date();
      const isSameDay = lastUpdate.getFullYear() === now.getFullYear() &&
                        lastUpdate.getMonth() === now.getMonth() &&
                        lastUpdate.getDate() === now.getDate();
      
      if (!isSameDay) {
        fetchAndCacheSummary();
      }
    };

    checkSummaryDate();
  }, [stats?.userId, tasks.length]);

  // Periodic live recomputation of priority scores (every 10 seconds or on task change)
  useEffect(() => {
    const updateScores = () => {
      const updated = tasks.map(t => ({
        ...t,
        priorityScore: calculateLivePriorityScore(t)
      }));
      // Sort tasks: completed at the bottom, then by priority score descending
      updated.sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        return b.priorityScore - a.priorityScore;
      });
      setLiveTasks(updated);
    };

    updateScores();
    const interval = setInterval(updateScores, 15000);
    return () => clearInterval(interval);
  }, [tasks]);

  const handleDelete = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  const handleQuickStatus = async (e: React.MouseEvent, task: Task, newStatus: Task['status']) => {
    e.stopPropagation();
    try {
      const updates: Partial<Task> = { status: newStatus };
      if (newStatus === 'completed') {
        updates.completedAt = new Date().toISOString();
        
        // Handle streak logic in the parent/App or here
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
      await updateDoc(doc(db, 'tasks', task.id), updates);
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  // Stats summaries
  const pendingTasks = liveTasks.filter(t => t.status !== 'completed');
  const criticalCount = pendingTasks.filter(t => t.priorityScore >= 85).length;
  const inProgressCount = pendingTasks.filter(t => t.status === 'in_progress').length;
  const completionRate = stats && stats.totalCompleted > 0 
    ? Math.round((stats.totalCompletedOnTime / stats.totalCompleted) * 100) 
    : 100;

  // Format date readable
  const formatDeadline = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 0) {
      return 'Overdue';
    }
    if (diffHours < 1) {
      return `In ${Math.round(diffHours * 60)}m`;
    }
    if (diffHours < 24) {
      return `In ${Math.round(diffHours)}h (${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-1" id="dashboard-container">
      {/* Daily AI Advisor Focus Summary */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-indigo-50/70 to-purple-50/70 border border-indigo-100 rounded-3xl p-5 md:p-6 shadow-xs relative overflow-hidden" 
        id="ai-advisor-focus-card"
      >
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex gap-3.5 items-start">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 border border-indigo-200 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase font-mono">
                  AI Tactical Advisor
                </span>
                <span className="text-[9px] font-mono text-slate-400">
                  Updated daily
                </span>
              </div>
              <h2 className="text-sm font-bold text-slate-800">
                Your ZeroHour Focus Plan
              </h2>
              {summaryLoading ? (
                <div className="space-y-2 py-1.5 w-64 md:w-96">
                  <div className="h-3 bg-indigo-200/50 rounded-full animate-pulse w-full"></div>
                  <div className="h-3 bg-indigo-200/50 rounded-full animate-pulse w-5/6"></div>
                </div>
              ) : summaryError ? (
                <p className="text-xs text-rose-600">{summaryError}</p>
              ) : (
                <p className="text-xs text-slate-600 leading-relaxed max-w-2xl font-medium">
                  {stats?.focusSummary || "All clear! Add standard or urgent tasks to receive tactical advice."}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => fetchAndCacheSummary(true)}
            disabled={summaryLoading}
            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100/50 px-3 py-1.5 rounded-xl border border-indigo-200 transition-all self-end md:self-center bg-white shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
            id="btn-refresh-focus-summary"
          >
            {summaryLoading ? "Analyzing..." : "Refresh Advice"}
          </button>
        </div>
      </motion.div>

      {/* Upper Status Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="stats-grid">
        {/* Streak Board */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between h-28 relative overflow-hidden group shadow-xs hover:shadow-sm transition-shadow"
          id="streak-card"
        >
          <div className="absolute top-[-20%] right-[-10%] opacity-10 group-hover:opacity-25 transition-opacity">
            <Flame className="w-24 h-24 text-orange-500 fill-orange-500" />
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <Flame className="w-4 h-4 text-orange-500 animate-pulse fill-orange-500" />
            <span>On-Time Streak</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold font-display text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600 leading-none">
              {stats?.streakCount || 0}
            </span>
            <span className="text-xs text-slate-400 font-medium">consecutive</span>
          </div>
        </motion.div>

        {/* Completion Rate */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between h-28 relative overflow-hidden group shadow-xs hover:shadow-sm transition-shadow"
          id="completion-rate-card"
        >
          <div className="absolute top-[-20%] right-[-10%] opacity-10 group-hover:opacity-25 transition-opacity">
            <TrendingUp className="w-24 h-24 text-emerald-500" />
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>On-Time Rate</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold font-display text-emerald-600 leading-none">
              {completionRate}%
            </span>
            <span className="text-xs text-slate-400 font-medium">of completed</span>
          </div>
        </motion.div>

        {/* Critical Tasks */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between h-28 relative overflow-hidden group shadow-xs hover:shadow-sm transition-shadow"
          id="critical-count-card"
        >
          <div className="absolute top-[-20%] right-[-10%] opacity-10 group-hover:opacity-25 transition-opacity">
            <AlertTriangle className="w-24 h-24 text-rose-500" />
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span>Crisis Zones</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold font-display text-rose-600 leading-none">
              {criticalCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">critical tasks</span>
          </div>
        </motion.div>

        {/* Total Tasks Active */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between h-28 relative overflow-hidden group shadow-xs hover:shadow-sm transition-shadow"
          id="active-tasks-card"
        >
          <div className="absolute top-[-20%] right-[-10%] opacity-10 group-hover:opacity-25 transition-opacity">
            <Clock className="w-24 h-24 text-indigo-500" />
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span>Active Duties</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold font-display text-indigo-600 leading-none">
              {pendingTasks.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">remaining</span>
          </div>
        </motion.div>
      </div>

      {/* Task List Header */}
      <div className="flex justify-between items-center mt-8 pb-2 border-b border-slate-200" id="task-list-header">
        <h2 className="text-xl font-bold font-display tracking-tight text-slate-800 flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-600" />
          Impending Deadlines
        </h2>
        <button
          id="btn-add-task-dash"
          onClick={() => onNavigate('add-task')}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          Load Objective
        </button>
      </div>

      {/* Task List */}
      <div className="space-y-3" id="task-list-container">
        {liveTasks.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8 shadow-xs"
            id="empty-tasks-placeholder"
          >
            <Zap className="w-10 h-10 text-slate-400 mx-auto mb-3 animate-pulse" />
            <h3 className="text-slate-800 font-bold mb-1 text-sm">No impending crises... yet.</h3>
            <p className="text-slate-500 text-xs max-w-sm mx-auto mb-4">
              Your calendar is safe. Use "Add Task" to dictate or type your next high-stress objective.
            </p>
            <button
              onClick={() => onNavigate('add-task')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95"
            >
              Add Your First Task
            </button>
          </motion.div>
        ) : (
          liveTasks.map((task, index) => {
            const badge = getPriorityBadge(task.priorityScore);
            const isCompleted = task.status === 'completed';
            const isRescueMode = task.status === 'rescue_mode';

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.3) }}
                onClick={() => onNavigate('task-detail', task.id)}
                className={`group cursor-pointer rounded-2xl border p-4 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden shadow-xs hover:shadow-md ${
                  isCompleted 
                    ? 'bg-slate-100/60 border-slate-200/80 opacity-75 hover:opacity-100' 
                    : isRescueMode 
                    ? 'bg-rose-50/70 border-rose-200/80 hover:bg-rose-50 shadow-[0_2px_12px_rgba(244,63,94,0.06)]' 
                    : 'bg-white border-slate-200 hover:bg-slate-50/50 hover:border-slate-300'
                }`}
                id={`task-card-${task.id}`}
              >
                {/* Visual rescue border highlight */}
                {isRescueMode && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500"></div>
                )}

                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Status Check Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickStatus(e, task, isCompleted ? 'not_started' : 'completed');
                    }}
                    className={`mt-1 flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                      isCompleted 
                        ? 'bg-emerald-500 border-emerald-500 text-white' 
                        : isRescueMode
                        ? 'border-rose-300 text-rose-500 hover:bg-rose-100/50 bg-white'
                        : 'border-slate-300 text-slate-400 hover:border-indigo-600 hover:text-indigo-600 bg-white'
                    }`}
                    id={`btn-complete-${task.id}`}
                  >
                    {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-slate-600 text-xs font-mono px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200/60">
                        {task.category}
                      </span>
                      {!isCompleted && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.color} ${badge.border}`}>
                          {badge.label}
                        </span>
                      )}
                      {isRescueMode && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                          RESCUE ACTIVE
                        </span>
                      )}
                    </div>
                    
                    <h3 className={`text-sm md:text-base font-semibold truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {task.title}
                    </h3>

                    {/* Deadline and effort info */}
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1.5">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span className={isRescueMode && !isCompleted ? 'text-rose-600 font-semibold' : ''}>
                          {formatDeadline(task.deadline)}
                        </span>
                      </div>
                      <div>
                        Est: <span className="text-slate-700 font-mono font-medium">{task.estimatedEffortMinutes}m</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Priority circle / controls */}
                <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                  {!isCompleted ? (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider leading-none">Priority</span>
                        <span className={`text-base font-black font-mono leading-none mt-1 ${badge.color}`}>
                          {task.priorityScore}
                        </span>
                      </div>
                      <div className="w-2 h-8 rounded-full bg-slate-100 overflow-hidden">
                        <div 
                          className={`w-full rounded-full ${
                            task.priorityScore >= 85 
                              ? 'bg-rose-500' 
                              : task.priorityScore >= 60 
                              ? 'bg-orange-500' 
                              : 'bg-yellow-500'
                          }`}
                          style={{ height: `${task.priorityScore}%`, marginTop: `${100 - task.priorityScore}%` }}
                        ></div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5" /> Completed
                    </span>
                  )}

                  <div className="flex items-center gap-1.5">
                    {!isCompleted && task.status === 'not_started' && (
                      <button
                        onClick={(e) => handleQuickStatus(e, task, 'in_progress')}
                        className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Start Task"
                      >
                        <PlayCircle className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTaskToDelete(task);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Dismiss Task"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Custom Confirmation Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" id="delete-confirmation-modal">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 relative"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-slate-900 font-bold text-lg mb-1">Dismiss Objective?</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Are you sure you want to permanently dismiss <span className="font-semibold text-slate-800">"{taskToDelete.title}"</span>? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => setTaskToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                id="btn-cancel-delete"
              >
                No, Keep It
              </button>
              <button
                onClick={async () => {
                  try {
                    await handleDelete(taskToDelete.id);
                    setTaskToDelete(null);
                  } catch (err) {
                    console.error('Error deleting task:', err);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                id="btn-confirm-delete"
              >
                <Trash className="w-3.5 h-3.5" />
                Yes, Dismiss
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
