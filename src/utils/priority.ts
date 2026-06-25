/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from '../types';

/**
 * Recomputes priority score live based on time remaining vs effort remaining.
 * Closer to deadline with more effort remaining = HIGHER score (capped at 100).
 * Completed tasks always score 0.
 */
export function calculateLivePriorityScore(task: Task): number {
  if (task.status === 'completed') {
    return 0;
  }

  const now = Date.now();
  const deadlineTime = new Date(task.deadline).getTime();
  const msRemaining = deadlineTime - now;
  const hoursRemaining = msRemaining / (1000 * 60 * 60);

  // If already past deadline, max score
  if (hoursRemaining <= 0) {
    return 100;
  }

  // 1. Urgency factor (closer to deadline = higher score)
  // Scale urgency from 0 to 60. Over 48 hours remaining gets minimal base urgency.
  const urgencyWeight = 60;
  const urgencyScore = urgencyWeight * (1 - Math.min(hoursRemaining / 48, 1));

  // 2. Effort factor vs Remaining Time (high effort with little time left = critical)
  const effortHours = task.estimatedEffortMinutes / 60;
  
  // Ratio represents the proportion of remaining time that must be spent working
  const hoursBuffer = Math.max(hoursRemaining, 0.2); // prevent division by zero
  const effortRatio = effortHours / hoursBuffer;

  // Scale ratio score from 0 to 40. ratio >= 1 means extreme emergency (effort equals or exceeds remaining time)
  const ratioWeight = 40;
  const ratioScore = Math.min(effortRatio, 1.2) * ratioWeight;

  let totalScore = Math.round(urgencyScore + ratioScore);

  // Boost for active Rescue Mode
  if (task.status === 'rescue_mode' || hoursRemaining < 3) {
    totalScore += 10;
  }

  return Math.min(Math.max(totalScore, 0), 100);
}

/**
 * Returns a color class and visual urgency label based on priority score.
 */
export function getPriorityBadge(score: number): {
  color: string;
  bg: string;
  border: string;
  label: string;
} {
  if (score >= 85) {
    return {
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      label: 'CRITICAL',
    };
  } else if (score >= 60) {
    return {
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
      label: 'HIGH URGENCY',
    };
  } else if (score >= 35) {
    return {
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      label: 'MODERATE',
    };
  } else {
    return {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      label: 'STABLE',
    };
  }
}
