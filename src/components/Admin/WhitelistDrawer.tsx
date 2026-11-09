import React, { useState, useEffect } from 'react';
import { 
  X, 
  UserPlus, 
  Trash2, 
  ShieldCheck, 
  Search, 
  Copy, 
  Check, 
  AlertCircle, 
  Clock, 
  UserCheck, 
  UserX, 
  Users, 
  CheckCheck 
} from 'lucide-react';
import { 
  fetchWhitelist, 
  subscribeToWhitelist, 
  addWhitelistEmails, 
  removeWhitelistEmail 
} from '../../services/whitelistService';
import { 
  subscribeToPendingRequests, 
  approveAccessRequest, 
  rejectAccessRequest 
} from '../../services/accessRequestService';
import { useAuth } from '../../context/AuthContext';
import type { WhitelistEntry, AccessRequest } from '../../types';

interface WhitelistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatRequestTime(timestamp: number | any): string {
  if (!timestamp) return 'Just now';
  const time = typeof timestamp === 'number' 
    ? timestamp 
    : (timestamp?.toMillis ? timestamp.toMillis() : Date.now());
  const diff = Date.now() - time;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const WhitelistDrawer: React.FC<WhitelistDrawerProps> = ({ isOpen, onClose }) => {
  const { adminEmail } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'requests' | 'whitelist'>('requests');
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [rawInput, setRawInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Subscribe to pending requests & whitelist
  useEffect(() => {
    if (!isOpen) return;

    fetchWhitelist().then(setWhitelist);
    const unsubWhitelist = subscribeToWhitelist((list) => {
      setWhitelist(list);
    });

    const unsubRequests = subscribeToPendingRequests((reqs) => {
      setPendingRequests(reqs);
      // Auto-switch to requests tab if there are pending requests
      if (reqs.length > 0) {
        setActiveTab('requests');
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubWhitelist();
      unsubRequests();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleApprove = async (req: AccessRequest) => {
    setActionLoadingId(req.uid);
    setStatusMessage(null);
    try {
      await approveAccessRequest(req, adminEmail);
      
      // Notify other tabs via BroadcastChannel
      try {
        const bc = new BroadcastChannel('noteshub_access_channel');
        bc.postMessage({ type: 'APPROVED', uid: req.uid, email: req.email });
        bc.close();
      } catch {
        // ignore
      }

      setStatusMessage({
        type: 'success',
        text: `Approved ${req.displayName} (${req.email}). Account is now activated!`,
      });
      // Optimistically remove from pending list
      setPendingRequests((prev) => prev.filter((r) => r.uid !== req.uid));
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to approve request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (req: AccessRequest) => {
    if (!window.confirm(`Decline access request for ${req.displayName} (${req.email})?`)) {
      return;
    }

    setActionLoadingId(req.uid);
    setStatusMessage(null);
    try {
      await rejectAccessRequest(req, adminEmail);
      setStatusMessage({
        type: 'success',
        text: `Declined access for ${req.email}.`,
      });
      setPendingRequests((prev) => prev.filter((r) => r.uid !== req.uid));
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to reject request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAddEmails = async () => {
    if (!rawInput.trim()) return;
    setStatusMessage(null);

    try {
      const res = await addWhitelistEmails(rawInput, adminEmail);
      if (res.added > 0) {
        setStatusMessage({
          type: 'success',
          text: `Successfully added ${res.added} classmate${res.added > 1 ? 's' : ''} to whitelist.`,
        });
        setRawInput('');
        fetchWhitelist().then(setWhitelist);
      } else if (res.invalid.length > 0) {
        setStatusMessage({
          type: 'error',
          text: `No valid emails recognized. Invalid: ${res.invalid.slice(0, 3).join(', ')}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to update whitelist.',
      });
    }
  };

  const handleRemove = async (entry: WhitelistEntry) => {
    if (window.confirm(`Remove ${entry.email} from cohort whitelist?`)) {
      await removeWhitelistEmail(entry);
      setWhitelist((prev) => prev.filter((e) => e.id !== entry.id));
    }
  };

  const handleCopyAll = () => {
    const emails = whitelist.map((w) => w.email).join(', ');
    navigator.clipboard.writeText(emails);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredWhitelist = whitelist.filter((item) =>
    item.email.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 transition-opacity animate-nh-fade"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] md:w-[500px] max-w-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-[100dvh] overscroll-contain animate-nh-drawer select-none">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Cohort Access &amp; Whitelist</h3>
                {pendingRequests.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono animate-pulse">
                    🔔 {pendingRequests.length} Pending
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Approval-on-Request System • Cohort of 76
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher: Access Requests vs Approved Classmates */}
        <div className="flex items-center p-2 bg-slate-950/80 border-b border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'requests'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25'
                : 'bg-slate-900 hover:bg-slate-800/80 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Access Requests</span>
            {pendingRequests.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'requests'
                  ? 'bg-white text-indigo-700'
                  : 'bg-amber-500/20 text-amber-300'
              }`}>
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('whitelist')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'whitelist'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25'
                : 'bg-slate-900 hover:bg-slate-800/80 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Approved Classmates</span>
            <span className="text-[10px] text-slate-400 font-mono">
              ({whitelist.length})
            </span>
          </button>
        </div>

        {/* Status Toast Message */}
        {statusMessage && (
          <div className={`m-3 p-3 rounded-xl text-xs flex items-center gap-2 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/50 border-red-500/30 text-red-300'
          }`}>
            {statusMessage.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span className="flex-1">{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab 1: Access Requests Content */}
        {activeTab === 'requests' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header toolbar */}
            <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Pending Approvals ({pendingRequests.length})</span>
              </div>
            </div>

            {/* Requests List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pendingRequests.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 text-slate-500 flex items-center justify-center mx-auto mb-3">
                    <CheckCheck className="w-7 h-7 text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">All Caught Up!</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto mb-4">
                    No pending student access requests. When classmates sign in for the first time, their requests will appear here for one-click approval.
                  </p>
                </div>
              ) : (
                pendingRequests.map((req) => {
                  const isLoading = actionLoadingId === req.uid;

                  return (
                    <div
                      key={req.uid}
                      className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 hover:border-indigo-500/40 transition-all shadow-md flex flex-col gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={
                            req.photoURL ||
                            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                              req.displayName || req.email
                            )}`
                          }
                          alt={req.displayName}
                          className="w-11 h-11 rounded-full border border-slate-600 object-cover bg-slate-700 shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-white truncate">
                              {req.displayName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 shrink-0">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{formatRequestTime(req.requestedAt)}</span>
                            </span>
                          </div>

                          <div className="text-[11px] text-indigo-300 font-mono truncate mt-0.5">
                            {req.email}
                          </div>

                          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span>Requesting Cohort Portal Access</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons: Approve (Green) & Reject (Red) */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-700/60">
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={isLoading}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-600/30 flex items-center justify-center gap-1.5"
                          title="Grant access and activate account"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>

                        <button
                          onClick={() => handleReject(req)}
                          disabled={isLoading}
                          className="py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 active:scale-95 disabled:opacity-50 border border-red-500/30 text-red-300 hover:text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                          title="Decline access request"
                        >
                          <UserX className="w-3.5 h-3.5 text-red-400" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Approved Classmates Whitelist Content */}
        {activeTab === 'whitelist' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Batch Email Import Box */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800">
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Batch Add Verified Emails
              </label>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="Paste institutional emails separated by commas or lines...&#10;e.g. rahul.k@univ.edu, ananya.s@univ.edu"
                rows={2}
                className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono resize-none"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  Separated by comma, space, or newline
                </span>
                <button
                  onClick={handleAddEmails}
                  disabled={!rawInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Enroll Emails</span>
                </button>
              </div>
            </div>

            {/* Search & Actions Bar */}
            <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search enrolled classmate emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <button
                onClick={handleCopyAll}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="Copy all enrolled emails to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Whitelist Members List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {filteredWhitelist.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  {searchQuery ? 'No enrolled emails match search.' : 'No cohort emails enrolled yet.'}
                </div>
              ) : (
                filteredWhitelist.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-2 hover:bg-slate-800 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono font-medium text-slate-200 truncate">
                        {item.email}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Added by {item.addedBy || 'Admin'} • {new Date(item.addedAt).toLocaleDateString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemove(item)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                      title="Revoke whitelist access"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>{whitelist.length} of 76 cohort seats verified</span>
          <span className="font-mono text-indigo-400">Approval-on-Request Active</span>
        </div>
      </div>
    </>
  );
};
