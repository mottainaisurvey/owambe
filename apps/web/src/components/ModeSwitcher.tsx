'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, PlatformMode, getModeLabel, getModeIcon, hasMode } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const MODE_ROUTES: Record<PlatformMode, string> = {
  EVENTS: '/dashboard',
  STAYS: '/dashboard/stays',
  EXPERIENCES: '/dashboard/experiences',
};

const MODE_DESCRIPTIONS: Record<PlatformMode, string> = {
  EVENTS: 'Plan & manage events',
  STAYS: 'Host & book properties',
  EXPERIENCES: 'Offer & book experiences',
};

const ALL_MODES: PlatformMode[] = ['EVENTS', 'STAYS', 'EXPERIENCES'];

export function ModeSwitcher() {
  const { user, activeMode, switchMode, isSwitchingMode } = useAuthStore();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const availableModes = ALL_MODES.filter(m => hasMode(user, m));

  if (availableModes.length <= 1) return null;

  const handleSwitch = async (mode: PlatformMode) => {
    if (mode === activeMode || isSwitchingMode) return;
    setIsOpen(false);
    try {
      await switchMode(mode);
      router.push(MODE_ROUTES[mode]);
    } catch {
      // Error handled in store
    }
  };

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitchingMode}
        className={cn(
          'flex items-center gap-2 w-full px-2.5 py-2 rounded-lg transition-colors text-left',
          'bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08]',
          isSwitchingMode && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className="text-base leading-none">{getModeIcon(activeMode)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-white truncate">
            {getModeLabel(activeMode)}
          </div>
          <div className="text-[9px] text-white/30 truncate">
            {MODE_DESCRIPTIONS[activeMode]}
          </div>
        </div>
        {isSwitchingMode ? (
          <div className="w-3 h-3 border border-white/30 border-t-white/80 rounded-full animate-spin shrink-0" />
        ) : (
          <svg
            className={cn('w-3 h-3 text-white/30 shrink-0 transition-transform', isOpen && 'rotate-180')}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-[#1a1f2e] border border-white/[0.10] rounded-lg shadow-xl overflow-hidden">
            {ALL_MODES.map((mode) => {
              const available = hasMode(user, mode);
              const isActive = mode === activeMode;
              return (
                <button
                  key={mode}
                  onClick={() => available && handleSwitch(mode)}
                  disabled={!available || isActive}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors',
                    isActive && 'bg-white/[0.08] cursor-default',
                    !isActive && available && 'hover:bg-white/[0.06] cursor-pointer',
                    !available && 'opacity-30 cursor-not-allowed'
                  )}
                >
                  <span className="text-base leading-none">{getModeIcon(mode)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-white flex items-center gap-1.5">
                      {getModeLabel(mode)}
                      {isActive && (
                        <span className="text-[8px] bg-[var(--accent2)] text-white px-1.5 py-0.5 rounded-full font-bold">
                          ACTIVE
                        </span>
                      )}
                      {!available && (
                        <span className="text-[8px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full font-bold">
                          COMING SOON
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] text-white/30 truncate">
                      {MODE_DESCRIPTIONS[mode]}
                    </div>
                  </div>
                  {isActive && (
                    <svg className="w-3.5 h-3.5 text-[var(--accent2)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
