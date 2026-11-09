import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface DisclaimerBannerProps {
  className?: string;
  isCompact?: boolean;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({ className = '', isCompact = false }) => {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 select-none ${className}`}
      role="alert"
    >
      <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium tracking-wide">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
        <span>
          <strong className="text-amber-300 font-semibold">Study reference only.</strong> Verify calculations and lab steps independently prior to final submission.
        </span>
      </div>
      {!isCompact && (
        <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-400/80 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>DRM Canvas Protected • Watermarked</span>
        </div>
      )}
    </div>
  );
};
