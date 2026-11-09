import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, isEmailAdmin, type AccessStatus } from './AuthProvider';

interface GateProps {
  allow: AccessStatus[];
  children: React.ReactNode;
}

export default function Gate({ allow, children }: GateProps) {
  const { access, user } = useAuth();
  
  // 1. Instant hard check: Admin always passes through with full access
  const isAdmin = isEmailAdmin(user?.email) || access === 'admin';
  if (isAdmin) {
    return <>{children}</>;
  }

  if (access === 'loading') return <div className="nh-boot" aria-busy="true" />;
  if (access === 'signed-out') return <Navigate to="/" replace />;
  
  // 2. Only apply waiting screen redirection to non-admin student emails
  if (access === 'pending' || access === 'rejected') return <Navigate to="/access" replace />;
  if (!allow.includes(access)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

