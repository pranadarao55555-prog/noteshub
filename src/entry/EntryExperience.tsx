import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, isEmailAdmin } from '../auth/AuthProvider';
import LoginCard from './LoginCard';
import FireworksBurst from './FireworksBurst';
import DashboardHome from '../dashboard/DashboardHome';
import deskScene from '../assets/desk-scene.jpg';
import './entry.css';

export default function EntryExperience() {
  const { access, user } = useAuth();
  const nav = useNavigate();
  const [phase, setPhase] = useState<'idle' | 'diving' | 'burst' | 'dashboard'>('idle');

  useEffect(() => {
    // 1. Instant hard check: Admin proceeds directly to dive/dashboard
    const isAdmin = isEmailAdmin(user?.email) || access === 'admin';
    if (isAdmin) {
      if (phase === 'idle') {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
          setPhase('dashboard');
          return;
        }
        setPhase('diving');
        const t1 = setTimeout(() => setPhase('burst'), 1300);
        const t2 = setTimeout(() => setPhase('dashboard'), 3400);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
        };
      }
      return;
    }

    // 2. Only apply waiting screen redirection to non-admin student emails
    if (access === 'pending' || access === 'rejected') {
      nav('/access', { replace: true });
      return;
    }
    if (access === 'signed-out') {
      setPhase('idle');
      return;
    }
    if (access === 'approved' && phase === 'idle') {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        setPhase('dashboard');
        return;
      }
      setPhase('diving');
      const t1 = setTimeout(() => setPhase('burst'), 1300);
      const t2 = setTimeout(() => setPhase('dashboard'), 3400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [access, user]); // eslint-disable-line

  return (
    <div className="nh-root">
      {phase !== 'dashboard' && (
        <div className={`nh-viewport nh-${phase}`}>
          <div className="nh-stage">
            <img src={deskScene} alt="" className="nh-desk" draggable={false} />
            <div className="nh-screen-glow" />
          </div>
          <div className="nh-vignette" />
          {phase === 'idle' && <LoginCard />}
          {phase === 'burst' && (
            <>
              {/* Ambient full-viewport fireworks burst */}
              <FireworksBurst />

              {/* Luminous Celebration Greeting */}
              <div
                className="fixed inset-0 z-30 flex flex-col items-center justify-center p-4 pointer-events-none select-none bg-transparent border-none shadow-none"
                role="dialog"
                aria-modal="true"
                aria-label="Welcome celebration"
              >
                <div className="flex flex-col items-center justify-center text-center max-w-5xl mx-auto px-4 nh-welcome-celebration">
                  <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-widest text-white uppercase text-center select-none drop-shadow-[0_0_25px_rgba(255,255,255,0.85)] filter">
                    WELCOME! YOU'RE IN!
                  </h1>
                  <p className="text-sm sm:text-base text-cyan-200/90 font-medium tracking-widest uppercase mt-3 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">
                    Setting up your NotesHub workspace...
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {phase === 'dashboard' && <DashboardHome />}
    </div>
  );
}
