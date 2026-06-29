/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  User, 
  Mail, 
  Lock, 
  Trophy, 
  Flame, 
  Clock, 
  LogOut, 
  Info,
  ShieldCheck,
  CheckCircle,
  Zap
} from 'lucide-react';
import { UserStats, Settings, Task } from '../types';
import { auth, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, getLocalFallbackStatus, signInWithPopup, GoogleAuthProvider } from '../firebase';

interface ProfileSettingsProps {
  userId: string;
  userEmail: string | null;
  stats: UserStats | null;
  settings: Settings;
  onUpdateSettings: (newSettings: Settings) => void;
  tasks?: Task[];
}

export default function ProfileSettings({ 
  userId, 
  userEmail, 
  stats, 
  settings, 
  onUpdateSettings,
  tasks = []
}: ProfileSettingsProps) {
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUpdateHours = (hours: number) => {
    if (hours >= 1 && hours <= 24) {
      onUpdateSettings({ ...settings, dailyAvailableHours: hours });
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const handleEmailAuth = async (isSignUp: boolean) => {
    if (!emailInput || !passInput) return;
    setLoading(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, emailInput, passInput);
        setAuthSuccess('Account created successfully! Upgraded from anonymous mode.');
      } else {
        await signInWithEmailAndPassword(auth, emailInput, passInput);
        setAuthSuccess('Logged in successfully!');
      }
      setEmailInput('');
      setPassInput('');
    } catch (err: any) {
      console.error('Auth error:', err);
      setAuthError(err.message || 'Authentication failed. Review credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setAuthSuccess('Logged in successfully with Google!');
    } catch (err: any) {
      console.error('Google auth error:', err);
      setAuthError(err.message || 'Google Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isAnonymous = !userEmail;

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-1" id="profile-settings-container">
      {/* Title */}
      <div id="profile-title">
        <h1 className="text-2xl font-bold font-display tracking-tight text-slate-800 flex items-center gap-2">
          <User className="w-5.5 h-5.5 text-indigo-600" />
          Operator Control Deck
        </h1>
        <p className="text-slate-500 text-xs mt-1">
          Adjust scheduling bounds, authenticate your terminal, and view historical objective performance metrics.
        </p>
      </div>

      {/* Operator coordinates & Auth card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs" id="operator-auth-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold font-mono">
            OP
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Operator Rank</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                isAnonymous ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                {isAnonymous ? 'ANONYMOUS TERM' : 'IDENTIFIED TERM'}
              </span>
            </div>
            <h3 className="font-semibold text-slate-800 text-sm truncate">
              {isAnonymous ? 'Terminal Guest Operator' : userEmail}
            </h3>
          </div>
          {!isAnonymous && (
            <button
              onClick={handleSignOut}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer border border-slate-200/60"
              title="Terminate Connection"
              id="btn-sign-out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Upgrade from Guest form if anonymous */}
        {isAnonymous && (
          <div className="pt-4 border-t border-slate-100 space-y-3" id="upgrade-account-section">
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Secure Terminal (Upgrade Rank)</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Upgrading transfers your local guest objectives to a permanent cloud account.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="auth-inputs">
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Email address"
                  className="w-full bg-slate-50/50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl py-2 pl-10 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="Secure password"
                  className="w-full bg-slate-50/50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl py-2 pl-10 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none"
                />
              </div>
            </div>

            {authError && (
              <span className="text-[10px] text-rose-700 font-medium block bg-rose-50 px-2 py-1 rounded border border-rose-200">
                {authError}
              </span>
            )}
            {authSuccess && (
              <span className="text-[10px] text-emerald-700 font-medium block bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                {authSuccess}
              </span>
            )}

            <div className="flex gap-2 pt-1" id="auth-buttons">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleEmailAuth(false)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all border border-slate-200/85 cursor-pointer"
              >
                Identify / Log In
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleEmailAuth(true)}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Register / Sign Up
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2 my-2" id="auth-divider">
              <div className="flex-1 h-px bg-slate-200/60"></div>
              <span className="text-[10px] uppercase font-bold text-slate-400">or</span>
              <div className="flex-1 h-px bg-slate-200/60"></div>
            </div>

            {/* Google Sign In Button */}
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleAuth}
              className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-all border border-slate-200 shadow-xs hover:shadow-sm cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99]"
              id="btn-google-auth"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        )}
      </div>

      {/* Target Hours settings cards */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4" id="target-hours-settings-card">
        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-4 h-4 text-indigo-600" /> Time Management Bounds
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Configure how many hours per day you can actively devote to working on critical tasks.
          </p>
        </div>

        <div className="flex items-center gap-4 pt-1" id="hours-slider-row">
          <input
            type="range"
            min="1"
            max="24"
            value={settings.dailyAvailableHours}
            onChange={(e) => handleUpdateHours(parseInt(e.target.value) || 6)}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <span className="font-mono text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 whitespace-nowrap">
            {settings.dailyAvailableHours} hours
          </span>
        </div>
      </div>

      {/* Deadline Email Alerts Settings */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs" id="email-alerts-settings-card">
        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-indigo-600" /> Deadline Email Alerts
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Enter your email to receive automated alerts 3 hours before a scheduled objective's deadline.
          </p>
        </div>

        <div className="space-y-2" id="email-alerts-input-wrapper">
          <input
            type="email"
            value={settings.notificationEmail || ''}
            onChange={(e) => onUpdateSettings({ ...settings, notificationEmail: e.target.value })}
            placeholder="e.g. operator@example.com"
            className="w-full bg-slate-50/50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl py-2 px-3 text-xs text-slate-800 placeholder-slate-400 outline-none leading-relaxed transition-all shadow-xs"
          />
          <span className="text-[10px] text-indigo-600 block pl-1">
            {settings.notificationEmail ? "✓ Alert notifications configured" : "Alert notifications disabled"}
          </span>
        </div>
      </div>

      {/* Operator stats dossier */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="stats-dossier-grid">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between h-28 relative overflow-hidden shadow-xs">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium uppercase tracking-wider">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>On-Time Victory dossiers</span>
          </div>
          <div className="flex items-baseline gap-2 pt-2">
            <span className="text-3xl font-black font-display text-amber-500 leading-none">
              {stats?.totalCompletedOnTime || 0}
            </span>
            <span className="text-xs text-slate-400">of {stats?.totalCompleted || 0} completed</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between h-28 relative overflow-hidden shadow-xs">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium uppercase tracking-wider">
            <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
            <span>High Peak Streak</span>
          </div>
          <div className="flex items-baseline gap-2 pt-2">
            <span className="text-3xl font-black font-display text-orange-600 leading-none">
              {stats?.streakCount || 0}
            </span>
            <span className="text-xs text-slate-400">active streak days</span>
          </div>
        </div>
      </div>

      {/* Hackathon metadata dossier */}
      <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-3" id="hackathon-dossier-card">
        <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium uppercase tracking-wider">
          <Info className="w-4 h-4 text-indigo-600" />
          <span>System Specifications & Dossier</span>
        </div>
        <div className="space-y-3 text-xs text-slate-600" id="project-credits-text">
          <p>
            <strong className="text-slate-700 font-semibold">Project Name:</strong> <span className="font-mono text-indigo-700">ZeroHour v1.0.0</span>
          </p>
          <p>
            <strong className="text-slate-700 font-semibold">Storage Engine:</strong> <span className="font-mono text-indigo-700">{getLocalFallbackStatus() ? 'Local Web Storage (Fallback Mode)' : 'Cloud Firestore'}</span>
          </p>
          <p>
            <strong className="text-slate-700 font-semibold">Identity Signature:</strong> <span className="font-mono text-indigo-700">{userEmail ? 'Secure Authenticated User' : 'Anonymous Guest Sandbox'}</span>
          </p>
          <p>
            <strong className="text-slate-700 font-semibold">Total Tracked Objectives:</strong> <span className="font-mono text-indigo-700">{tasks.length} objectives loaded</span>
          </p>
        </div>
      </div>
    </div>
  );
}
