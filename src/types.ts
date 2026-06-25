/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Task {
  id: string;
  userId: string;
  title: string;
  deadline: string; // ISO 8601 string
  estimatedEffortMinutes: number;
  category: string;
  priorityScore: number; // 0 - 100
  status: 'not_started' | 'in_progress' | 'rescue_mode' | 'completed';
  rescueChecklist: ChecklistItem[] | null;
  completedAt: string | null; // ISO 8601 string
  createdAt: string; // ISO 8601 string
  emailSentAt?: string | null; // ISO 8601 string when approaching email alert was sent
}

export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  instruction?: string;
}

export interface UserStats {
  userId: string;
  streakCount: number;
  lastCompletedAt: string | null; // ISO 8601 string
  totalCompletedOnTime: number;
  totalCompleted: number;
  focusSummary?: string | null;
  focusSummaryUpdatedAt?: string | null; // ISO 8601 string
}

export interface Settings {
  dailyAvailableHours: number; // default e.g. 6
  notificationEmail?: string; // Optional email address for alerts
}
