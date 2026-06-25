/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Calendar, 
  Clock, 
  Coffee, 
  Sparkles, 
  AlertCircle, 
  CheckCircle, 
  Circle,
  Sliders,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { Task, UserStats, Settings } from '../types';
import { calculateLivePriorityScore } from '../utils/priority';
import { db, doc, updateDoc } from '../firebase';

interface SmartScheduleProps {
  tasks: Task[];
  stats: UserStats | null;
  settings: Settings;
  onNavigate: (screen: string, taskId?: string) => void;
  onUpdateSettings: (newSettings: Settings) => void;
}

interface ScheduledBlock {
  task: Task;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export default function SmartSchedule({ 
  tasks, 
  stats, 
  settings, 
  onNavigate,
  onUpdateSettings 
}: SmartScheduleProps) {
  const [allocatedBlocks, setAllocatedBlocks] = useState<ScheduledBlock[]>([]);
  const [overflowTasks, setOverflowTasks] = useState<Task[]>([]);
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [tempHours, setTempHours] = useState(settings.dailyAvailableHours);

  useEffect(() => {
    // 1. Filter out completed tasks and calculate latest priority scores
    const activeTasks = tasks
      .filter(t => t.status !== 'completed')
      .map(t => ({
        ...t,
        priorityScore: calculateLivePriorityScore(t)
      }));

    // 2. Sort by priority score descending
    activeTasks.sort((a, b) => b.priorityScore - a.priorityScore);

    // 3. Greedy packing into the daily available hours budget (in minutes)
    const budgetMinutes = settings.dailyAvailableHours * 60;
    let accumulatedMinutes = 0;
    const scheduled: ScheduledBlock[] = [];
    const overflow: Task[] = [];

    // Let's assume our schedule day starts at 9:00 AM local time today
    const baseDate = new Date();
    baseDate.setHours(9, 0, 0, 0);

    activeTasks.forEach(task => {
      const effort = task.estimatedEffortMinutes || 45;
      
      if (accumulatedMinutes + effort <= budgetMinutes) {
        // Calculate start and end times
        const start = new Date(baseDate.getTime() + accumulatedMinutes * 60 * 1000);
        const end = new Date(start.getTime() + effort * 60 * 1000);

        scheduled.push({
          task,
          startTime: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          endTime: end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          durationMinutes: effort
        });

        accumulatedMinutes += effort;
      } else {
        overflow.push(task);
      }
    });

    setAllocatedBlocks(scheduled);
    setOverflowTasks(overflow);
  }, [tasks, settings.dailyAvailableHours]);

  const handleUpdateHoursSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tempHours < 1 || tempHours > 24) return;
    onUpdateSettings({ ...settings, dailyAvailableHours: tempHours });
    setIsEditingHours(false);
  };

  const handleQuickComplete = async (task: Task) => {
    try {
      const taskRef = doc(db, 'tasks', task.id);
      const isBeforeDeadline = new Date().getTime() <= new Date(task.deadline).getTime();
      
      const updates: Partial<Task> = { 
        status: 'completed',
        completedAt: new Date().toISOString()
      };

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

      await updateDoc(taskRef, updates);
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  const totalMinutesAllocated = allocatedBlocks.reduce((acc, block) => acc + block.durationMinutes, 0);
  const totalHoursAllocated = (totalMinutesAllocated / 60).toFixed(1);
  const allocationPercent = Math.min((totalMinutesAllocated / (settings.dailyAvailableHours * 60)) * 100, 100);

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-1" id="smart-schedule-container">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200" id="schedule-header">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-slate-800 flex items-center gap-2">
            <Sparkles className="w-5.5 h-5.5 text-indigo-600" />
            Smart Priority Timeline
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            ZeroHour ranks and packs objectives to fit your target daily availability. Take back your schedule.
          </p>
        </div>

        {/* Available Hours Setting */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-xs" id="hours-indicator-box">
          <Clock className="w-4 h-4 text-slate-400" />
          {isEditingHours ? (
            <form onSubmit={handleUpdateHoursSubmit} className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="24"
                value={tempHours}
                onChange={(e) => setTempHours(parseFloat(e.target.value) || 0)}
                className="w-12 bg-slate-100 border border-slate-200 text-center font-mono rounded text-xs text-slate-800 p-0.5 outline-none"
              />
              <span className="text-xs text-slate-500">hrs</span>
              <button
                type="submit"
                className="ml-1 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded px-1.5 py-0.5 cursor-pointer"
              >
                Set
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Daily Limit:</span>
              <span className="text-slate-800 font-mono font-bold text-indigo-600">{settings.dailyAvailableHours} hrs</span>
              <button 
                onClick={() => {
                  setTempHours(settings.dailyAvailableHours);
                  setIsEditingHours(true);
                }}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                title="Change available hours"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress Budget Bar */}
      <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl" id="budget-progress-section">
        <div className="flex justify-between items-center text-xs mb-2">
          <span className="text-slate-500 font-medium">Timeline Allocation</span>
          <span className="font-mono text-slate-700 font-bold">
            {totalHoursAllocated} / {settings.dailyAvailableHours} hrs assigned ({Math.round(allocationPercent)}%)
          </span>
        </div>
        <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden border border-slate-300/40">
          <div 
            className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
            style={{ width: `${allocationPercent}%` }}
          />
        </div>
      </div>

      {/* Timeline Section */}
      <div className="space-y-4" id="timeline-and-overflow-grid">
        {allocatedBlocks.length === 0 ? (
          <div className="text-center py-16 bg-slate-50/50 border border-slate-200 rounded-2xl p-6" id="empty-schedule-state">
            <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-slate-700 font-semibold mb-1">Timeline Cleared</h3>
            <p className="text-slate-500 text-xs max-w-sm mx-auto">
              No tasks currently pending. Dictate your objectives to let ZeroHour structure your day.
            </p>
          </div>
        ) : (
          <div className="relative pl-6 md:pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200" id="timeline-list">
            {allocatedBlocks.map((block, index) => {
              const isRescue = block.task.status === 'rescue_mode';
              const isInProgress = block.task.status === 'in_progress';

              return (
                <motion.div
                  key={block.task.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onNavigate('task-detail', block.task.id)}
                  className={`relative cursor-pointer group bg-white hover:bg-slate-50 border shadow-xs hover:shadow-md ${
                    isRescue 
                      ? 'border-rose-200/80 bg-rose-50/40 shadow-[0_2px_12px_rgba(244,63,94,0.04)]' 
                      : isInProgress
                      ? 'border-indigo-200 bg-indigo-50/30'
                      : 'border-slate-200 hover:border-slate-300'
                  } rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all`}
                  id={`timeline-card-${block.task.id}`}
                >
                  {/* Timeline bullet dot */}
                  <div className="absolute left-[-29px] md:left-[-37px] top-5 w-4 h-4 rounded-full bg-slate-50 border-2 border-indigo-600 flex items-center justify-center z-10 group-hover:scale-110 transition-transform">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                        {block.startTime} - {block.endTime}
                      </span>
                      <span className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded-full font-mono uppercase">
                        {block.task.category}
                      </span>
                      {isRescue && (
                        <span className="text-[9px] font-black tracking-wider text-rose-600 bg-rose-100/60 px-2 py-0.5 rounded border border-rose-200 animate-pulse">
                          RESCUE ZONE
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors truncate text-sm md:text-base">
                      {block.task.title}
                    </h3>
                    
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span>Duration: <strong className="font-mono text-slate-700">{block.durationMinutes}m</strong></span>
                      <span>Priority Weight: <strong className="font-mono text-indigo-600">{block.task.priorityScore}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 justify-between md:justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickComplete(block.task);
                      }}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      title="Quick mark complete"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Mark Done
                    </button>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Overflow/Deferrals Block */}
      {overflowTasks.length > 0 && (
        <div className="mt-8 border-t border-slate-200 pt-6 space-y-3" id="overflow-tasks-section">
          <div className="flex items-center gap-2 text-slate-500" id="overflow-header">
            <AlertCircle className="w-4 h-4 text-orange-500 animate-pulse" />
            <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-700">Deferred to Next Session (Overflow)</h3>
          </div>
          <p className="text-slate-500 text-xs pl-1">
            These tasks exceeded your allocated {settings.dailyAvailableHours} available hours today, and have been safely deferred.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="overflow-grid">
            {overflowTasks.map(task => (
              <div
                key={task.id}
                onClick={() => onNavigate('task-detail', task.id)}
                className="bg-white hover:bg-slate-50 border border-slate-200 rounded-xl p-3.5 cursor-pointer flex justify-between items-center transition-all group shadow-xs hover:shadow-sm"
                id={`overflow-card-${task.id}`}
              >
                <div className="min-w-0">
                  <span className="text-[9px] text-slate-600 bg-slate-100 border border-slate-200/60 px-1.5 py-0.5 rounded font-mono uppercase block w-max mb-1">
                    {task.category}
                  </span>
                  <h4 className="font-medium text-slate-700 group-hover:text-indigo-600 truncate text-xs">
                    {task.title}
                  </h4>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Est: {task.estimatedEffortMinutes}m • Priority: {task.priorityScore}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
