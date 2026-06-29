/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Flame, 
  Clock, 
  Sparkles, 
  Layers, 
  Trophy, 
  Zap, 
  User, 
  PlusCircle, 
  Calendar,
  AlertTriangle,
  Menu,
  X
} from 'lucide-react';

// Firebase imports
import { 
  auth, 
  db, 
  onAuthStateChanged, 
  signInAnonymously, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  query, 
  where, 
  orderBy, 
  getDocs,
  updateDoc,
  onSnapshot,
  enableLocalFallback,
  disableLocalFallback,
  getLocalFallbackStatus
} from './firebase';


// Component imports
import Dashboard from './components/Dashboard';
import AddTask from './components/AddTask';
import SmartSchedule from './components/SmartSchedule';
import TaskDetail from './components/TaskDetail';
import ProfileSettings from './components/ProfileSettings';

// Types
import { Task, UserStats, Settings } from './types';

export default function App() {
  // Navigation & Screen States
  const [activeScreen, setActiveScreen] = useState<string>('dashboard');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(() => sessionStorage.getItem('banner_dismissed') === 'true');

  // User States
  const [user, setUser] = useState<any>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [userSettings, setUserSettings] = useState<Settings>({ dailyAvailableHours: 6 });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Listen to Firebase Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        console.log('Operator Authenticated:', currentUser.uid);
        
        // Sync local guest data to real user account if fallback was active
        if (getLocalFallbackStatus()) {
          console.log('Transferring local tasks/stats/settings to Cloud Firestore...');
          try {
            // Transfer tasks
            const localTasksStr = localStorage.getItem('zerohour_tasks');
            if (localTasksStr) {
              const localTasks = JSON.parse(localTasksStr);
              for (const task of localTasks) {
                if (task.userId === 'local-guest') {
                  const updatedTask = { ...task, userId: currentUser.uid };
                  await setDoc(doc(db, 'tasks', task.id), updatedTask);
                }
              }
              localStorage.removeItem('zerohour_tasks');
            }

            // Transfer stats
            const localStatsStr = localStorage.getItem('zerohour_userStats_local-guest');
            if (localStatsStr) {
              const localStats = JSON.parse(localStatsStr);
              const updatedStats = { ...localStats, userId: currentUser.uid };
              await setDoc(doc(db, 'userStats', currentUser.uid), updatedStats);
              localStorage.removeItem('zerohour_userStats_local-guest');
            }

            // Transfer settings
            const localSettingsStr = localStorage.getItem('zerohour_settings_local-guest');
            if (localSettingsStr) {
              const localSettings = JSON.parse(localSettingsStr);
              await setDoc(doc(db, 'settings', currentUser.uid), localSettings);
              localStorage.removeItem('zerohour_settings_local-guest');
            }
            console.log('Local guest data successfully synchronized to Cloud account.');
          } catch (syncErr) {
            console.error('Error syncing local guest data to Cloud Firestore:', syncErr);
          }
        }

        disableLocalFallback();
        setUser(currentUser);
        setLoading(false);
      } else {
        // Automatically and seamlessly sign in guest operator anonymously
        console.log('Initiating anonymous Guest Operator login...');
        try {
          disableLocalFallback();
          await signInAnonymously(auth);
        } catch (err) {
          console.warn('Anonymous auth restricted on Firebase. Falling back to Local Storage mode:', err);
          enableLocalFallback();
          const localGuestUser = {
            uid: 'local-guest',
            email: null,
            isAnonymous: true,
            emailVerified: false
          };
          setUser(localGuestUser);
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time synchronisation for User Tasks and Stats once authenticated
  useEffect(() => {
    if (!user) return;

    // --- Tasks Collection Listener ---
    const tasksQuery = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      const fetchedTasks: Task[] = [];
      snapshot.forEach((docSnap) => {
        fetchedTasks.push(docSnap.data() as Task);
      });
      setTasks(fetchedTasks);
    }, (err) => {
      console.error('Error listening to tasks:', err);
    });

    // --- Stats Document Listener & Bootstrap ---
    const statsDocRef = doc(db, 'userStats', user.uid);
    const unsubscribeStats = onSnapshot(statsDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        setUserStats(docSnap.data() as UserStats);
      } else {
        // Bootstrap fresh stats
        console.log('Bootstrapping fresh stats dossier for operator...');
        const initialStats: UserStats = {
          userId: user.uid,
          streakCount: 0,
          lastCompletedAt: null,
          totalCompletedOnTime: 0,
          totalCompleted: 0
        };
        await setDoc(statsDocRef, initialStats);
        setUserStats(initialStats);
      }
    });

    // --- Settings Document Listener & Bootstrap ---
    const settingsDocRef = doc(db, 'settings', user.uid);
    const unsubscribeSettings = onSnapshot(settingsDocRef, async (docSnap) => {
      let currentSettings: Settings;
      if (docSnap.exists()) {
        currentSettings = docSnap.data() as Settings;
      } else {
        // Default to 6 available hours
        currentSettings = { dailyAvailableHours: 6 };
      }

      // Auto-fill notificationEmail from user.email if empty/unset and user is a real account (non-anonymous)
      if (user && !user.isAnonymous && user.email) {
        if (!currentSettings.notificationEmail || currentSettings.notificationEmail.trim() === '') {
          console.log(`[Auto-fill Email] Automatically setting notificationEmail to account email: ${user.email}`);
          currentSettings = {
            ...currentSettings,
            notificationEmail: user.email
          };
          await setDoc(settingsDocRef, currentSettings);
        }
      } else if (!docSnap.exists()) {
        await setDoc(settingsDocRef, currentSettings);
      }

      setUserSettings(currentSettings);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeStats();
      unsubscribeSettings();
    };
  }, [user]);

  // 3. Client-Side Check for Approaching Deadlines
  useEffect(() => {
    if (!tasks || tasks.length === 0 || !userSettings || !userSettings.notificationEmail) return;

    const email = userSettings.notificationEmail.trim();
    if (email === '') return;

    const checkAndSendAlerts = async () => {
      const now = new Date();
      const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);

      for (const task of tasks) {
        if (task.status === 'completed') continue;
        if (task.emailSentAt) continue;

        const deadline = new Date(task.deadline);
        const isApproaching = deadline > now && deadline <= threeHoursFromNow;

        if (isApproaching) {
          console.log(`[Deadline Alerts] Task "${task.title}" is within 3 hours. Triggering alert...`);
          try {
            const response = await fetch('/api/tasks/send-deadline-alert', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                task,
                notificationEmail: email
              })
            });

            if (response.ok) {
              console.log(`[Deadline Alerts] Alert sent successfully for "${task.title}". Updating task state...`);
              const sentTimestamp = new Date().toISOString();
              await updateDoc(doc(db, 'tasks', task.id), { emailSentAt: sentTimestamp });
            } else {
              const errData = await response.json().catch(() => ({}));
              console.error(`[Deadline Alerts] Server returned error:`, errData);
            }
          } catch (err) {
            console.error(`[Deadline Alerts] Network error sending alert for "${task.title}":`, err);
          }
        }
      }
    };

    // Run check immediately
    checkAndSendAlerts();

    // Re-check every 2 minutes
    const intervalId = setInterval(checkAndSendAlerts, 2 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [tasks, userSettings]);

  // 4. Client-Side Global Background Check for Rescue Mode
  useEffect(() => {
    if (!tasks || tasks.length === 0) return;

    const checkAndTriggerRescue = async () => {
      const now = Date.now();

      for (const task of tasks) {
        if (task.status === 'completed' || task.status === 'rescue_mode' || task.rescueChecklist) continue;

        const deadlineTime = new Date(task.deadline).getTime();
        const msDiff = deadlineTime - now;
        const hoursRemaining = msDiff / (1000 * 60 * 60);

        if (hoursRemaining < 3) {
          console.log(`[Global Rescue Trigger] Task "${task.title}" has ${hoursRemaining.toFixed(2)}h remaining. Triggering automatic Rescue Mode...`);
          try {
            const hoursLeft = hoursRemaining > 0 ? hoursRemaining : 2;
            const response = await fetch('/api/tasks/rescue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: task.title,
                category: task.category,
                estimatedEffortMinutes: task.estimatedEffortMinutes,
                hoursRemaining: hoursLeft
              })
            });

            if (response.ok) {
              const checklist = await response.json();
              console.log(`[Global Rescue Trigger] Checklist received for "${task.title}". Writing back to Firestore...`);
              await updateDoc(doc(db, 'tasks', task.id), {
                status: 'rescue_mode',
                rescueChecklist: checklist
              });
            } else {
              const errData = await response.json().catch(() => ({}));
              console.error(`[Global Rescue Trigger] Server returned error for "${task.title}":`, errData);
            }
          } catch (err) {
            console.error(`[Global Rescue Trigger] Error executing background Rescue Mode for "${task.title}":`, err);
          }
        }
      }
    };

    // Run check immediately
    checkAndTriggerRescue();

    // Re-check every 2 minutes
    const intervalId = setInterval(checkAndTriggerRescue, 2 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [tasks]);

  const handleUpdateSettings = async (newSettings: Settings) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'settings', user.uid), newSettings);
      setUserSettings(newSettings);
    } catch (err) {
      console.error('Error updating settings:', err);
    }
  };

  const handleNavigate = (screen: string, taskId?: string) => {
    setActiveScreen(screen);
    if (taskId) {
      setSelectedTaskId(taskId);
    } else {
      setSelectedTaskId(null);
    }
  };

  const renderActiveScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        return (
          <Dashboard 
            tasks={tasks} 
            stats={userStats} 
            onNavigate={handleNavigate} 
          />
        );
      case 'add-task':
        return (
          <AddTask 
            userId={user?.uid || ''} 
            onNavigate={handleNavigate} 
          />
        );
      case 'smart-schedule':
        return (
          <SmartSchedule 
            tasks={tasks} 
            stats={userStats} 
            settings={userSettings} 
            onNavigate={handleNavigate}
            onUpdateSettings={handleUpdateSettings}
          />
        );
      case 'task-detail':
        return selectedTaskId ? (
          <TaskDetail 
            taskId={selectedTaskId} 
            tasks={tasks} 
            stats={userStats} 
            onNavigate={handleNavigate} 
          />
        ) : (
          <div className="text-center py-12 text-slate-400">Select an objective...</div>
        );
      case 'profile-settings':
        return (
          <ProfileSettings 
            userId={user?.uid || ''} 
            userEmail={user?.email || null} 
            stats={userStats} 
            settings={userSettings} 
            onUpdateSettings={handleUpdateSettings} 
            tasks={tasks}
          />
        );
      default:
        return <div className="text-center py-12 text-slate-400">Connecting...</div>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4" id="startup-loader">
        <Zap className="w-12 h-12 text-indigo-600 animate-bounce" />
        <h2 className="text-slate-800 text-sm font-semibold tracking-wider uppercase">
          ZeroHour Dashboard Initializing
        </h2>
        <div className="w-48 bg-slate-200 h-1 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 rounded-full animate-[loading_1.5s_infinite]" style={{ width: '40%' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col" id="app-root-wrapper">
      {/* Glow background spots */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-red-600/5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Primary Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-xs" id="primary-header">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          
          {/* Logo Brand */}
          <div 
            onClick={() => handleNavigate('dashboard')} 
            className="flex items-center gap-2 cursor-pointer group"
            id="brand-logo"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/10 group-hover:scale-105 transition-transform">
              <Zap className="w-4.5 h-4.5 text-white fill-white" />
            </div>
            <div>
              <span className="text-lg font-bold font-display tracking-tight text-slate-800 leading-none block">
                ZeroHour
              </span>
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest leading-none block mt-0.5">
                Last-Minute Guardian
              </span>
            </div>
          </div>

          {/* Quick Header widgets */}
          <div className="flex items-center gap-3" id="header-right-widgets">
            {/* Live Streak indicator */}
            {userStats && userStats.streakCount > 0 && (
              <div 
                onClick={() => handleNavigate('profile-settings')}
                className="cursor-pointer flex items-center gap-1 bg-orange-100 border border-orange-200 px-2.5 py-1 rounded-full text-orange-600 text-xs font-bold animate-pulse"
                title="Active on-time streak"
              >
                <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
                <span className="font-mono">{userStats.streakCount}d STREAK</span>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Main Screen Stage */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 md:py-8 pb-24 md:pb-8" id="primary-screen-stage">
        {getLocalFallbackStatus() && !bannerDismissed && (
          <motion.div 
            initial={{ scale: 0.96, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="mb-6 p-5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md text-xs text-amber-900 relative overflow-hidden"
            id="local-mode-warning-banner"
          >
            <div className="absolute top-0 left-0 w-2 h-full bg-amber-500"></div>
            <div className="flex gap-3 items-start pl-2 pr-4">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 md:mt-0 animate-bounce" />
              <div>
                <p className="font-bold text-sm text-amber-900 flex items-center gap-1">
                  Offline Local Mode Active
                </p>
                <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                  Guest Operator anonymous auth failed because Anonymous Sign-In is disabled/restricted in this Firebase project. To enable secure cloud backup, go to your <strong>Firebase Console &rarr; Build &rarr; Authentication &rarr; Sign-in method</strong>, add <strong>Anonymous</strong>, and turn it on.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
              <button 
                onClick={() => handleNavigate('profile-settings')}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold tracking-tight text-[11px] transition-all cursor-pointer shadow-xs"
              >
                Sign Up / Register
              </button>
              <button 
                onClick={() => {
                  setBannerDismissed(true);
                  sessionStorage.setItem('banner_dismissed', 'true');
                }}
                className="p-1.5 hover:bg-amber-200/50 text-amber-700 rounded-lg transition-all"
                title="Dismiss notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeScreen + (selectedTaskId || '')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {renderActiveScreen()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Elegant Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-2.5 px-6 shadow-[0_-5px_20px_-4px_rgba(0,0,0,0.05)]" id="bottom-navbar">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button
            onClick={() => handleNavigate('dashboard')}
            className={`flex flex-col items-center gap-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeScreen === 'dashboard' || activeScreen === 'task-detail' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
            id="nav-btn-dash"
          >
            <Layers className="w-5 h-5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => handleNavigate('add-task')}
            className={`flex flex-col items-center gap-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeScreen === 'add-task' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
            id="nav-btn-add"
          >
            <PlusCircle className="w-5 h-5" />
            <span>Add Task</span>
          </button>

          <button
            onClick={() => handleNavigate('smart-schedule')}
            className={`flex flex-col items-center gap-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeScreen === 'smart-schedule' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
            id="nav-btn-schedule"
          >
            <Calendar className="w-5 h-5" />
            <span>Schedule</span>
          </button>

          <button
            onClick={() => handleNavigate('profile-settings')}
            className={`flex flex-col items-center gap-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeScreen === 'profile-settings' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
            id="nav-btn-profile"
          >
            <User className="w-5 h-5" />
            <span>Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
