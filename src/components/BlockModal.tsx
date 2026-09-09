import { useState } from 'react';
import { Ban, X, AlertCircle, Loader2 } from 'lucide-react';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';

interface BlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockedUserId: number | null;
  blockedUserName?: string;
  onSuccess?: () => void;
}

export default function BlockModal({
  isOpen,
  onClose,
  blockedUserId,
  blockedUserName,
  onSuccess,
}: BlockModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !blockedUserId) return null;

  const handleBlock = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/blocks`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blocked_user_id: blockedUserId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to block user');
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error blocking user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl space-y-4">
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Block User</h3>
              {blockedUserName && (
                <p className="text-xs text-slate-400">
                  Target: <strong className="text-slate-200">{blockedUserName}</strong>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK ERROR */}
        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* CONFIRMATION MESSAGE */}
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-slate-200 text-sm leading-relaxed">
          <p className="font-semibold text-amber-300 mb-1">Are you sure you want to block this user?</p>
          <p className="text-xs text-slate-300">You will no longer be able to interact with this user.</p>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleBlock}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-sm transition cursor-pointer flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Block User</span>
          </button>
        </div>
      </div>
    </div>
  );
}
