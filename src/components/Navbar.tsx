import React, { useState } from 'react';
import { 
  GraduationCap, 
  Upload, 
  ShieldCheck, 
  LogIn, 
  LogOut, 
  ChevronDown,
  BookOpen
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';

interface NavbarProps {
  onOpenUpload: () => void;
  onOpenWhitelist?: () => void;
  onOpenSignIn: () => void;
  onOpenManageSubjects?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenUpload,
  onOpenWhitelist,
  onOpenSignIn,
  onOpenManageSubjects,
}) => {
  const { currentUser, signOut } = useAuth();
  const { onlineCount, setPresenceDrawerOpen } = usePresence();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const isAdmin = currentUser?.isAdmin;

  return (
    <header className="sticky top-0 z-30 bg-slate-950/85 border-b border-slate-800/80 backdrop-blur-xl select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-600/30">
            <GraduationCap className="w-5 h-5" />
            <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-black tracking-tight text-white font-sans">
                Notes<span className="text-indigo-400">Hub</span>
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                Cohort 76
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Handwritten Notes &amp; Lab Records
            </p>
          </div>
        </div>

        {/* Center / Right Toolbar */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Classmates Online Pill */}
          <button
            onClick={() => setPresenceDrawerOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-xs font-medium text-slate-200 transition-all shadow-sm group"
            title="View online classmates"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="font-mono text-emerald-400 font-bold group-hover:text-emerald-300">
              {onlineCount}
            </span>
            <span className="hidden md:inline text-slate-300">Online</span>
          </button>

          {/* Admin Action 1: Upload Notes Button - STRICTLY RESTRICTED TO ADMIN */}
          {isAdmin && (
            <button
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Notes</span>
            </button>
          )}

          {/* Admin Action 2: Manage Subjects Button */}
          {isAdmin && onOpenManageSubjects && (
            <button
              onClick={onOpenManageSubjects}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/40 text-slate-300 hover:text-white text-xs font-semibold transition-all"
              title="Manage Subjects"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>Subjects</span>
            </button>
          )}

          {/* Admin Action 3: Access Requests Button - STRICTLY RESTRICTED TO ADMIN */}
          {isAdmin && onOpenWhitelist && (
            <button
              onClick={onOpenWhitelist}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-white text-xs font-semibold transition-all group"
              title="Cohort Access & Whitelist"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-300" />
              <span className="hidden md:inline">Access Requests</span>
            </button>
          )}

          {/* User Profile Dropdown or Clean Sign In Button */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
              >
                <img
                  src={
                    currentUser.photoURL ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                      currentUser.displayName || currentUser.email
                    )}`
                  }
                  alt={currentUser.displayName}
                  className="w-7 h-7 rounded-lg border border-slate-700 object-cover"
                />
                <span className="text-xs font-semibold text-slate-200 hidden md:inline max-w-[120px] truncate">
                  {currentUser.displayName}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {profileDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  onMouseLeave={() => setProfileDropdownOpen(false)}
                >
                  <div className="p-2.5 border-b border-slate-800 mb-1">
                    <div className="flex items-center gap-2 mb-2">
                      <img
                        src={
                          currentUser.photoURL ||
                          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                            currentUser.displayName || currentUser.email
                          )}`
                        }
                        alt={currentUser.displayName}
                        className="w-8 h-8 rounded-lg border border-slate-700 object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate">
                          {currentUser.displayName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate">
                          {currentUser.email}
                        </div>
                      </div>
                    </div>
                    <div>
                      {currentUser.isAdmin ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Cohort Admin
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          Cohort Student
                        </span>
                      )}
                    </div>
                  </div>

                  {currentUser.isAdmin && onOpenManageSubjects && (
                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        onOpenManageSubjects();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      <BookOpen className="w-4 h-4 text-indigo-400" />
                      <span>Manage Subjects</span>
                    </button>
                  )}

                  {/* Sign Out Action */}
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      signOut();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-950/40 rounded-xl transition-colors mt-1"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenSignIn}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
