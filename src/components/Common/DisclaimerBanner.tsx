import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface DisclaimerBannerProps {
  className?: string;
  isCompact?: boolean;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({ className = '', isCompact = false }) => {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 sm:py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 select-none ${className}`}
      role="alert"
    >
      <div className="flex items-center gap-2 text-xs sm:text-sm font-medium tracking-wide truncate">
        <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0 animate-pulse" />
        <span className="truncate">
          <strong className="text-amber-300 font-semibold">Study reference only.</strong>{' '}
          <span className="hidden sm:inline">Verify calculations and lab steps independently prior to final submission.</span>
          <span className="sm:hidden">Verify steps before submission.</span>
        </span>
      </div>
      {!isCompact && (
        <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-400/80 font-mono shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>DRM Canvas Protected • Watermarked</span>
        </div>
      )}
    </div>
  );
};
