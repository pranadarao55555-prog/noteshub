import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { PresenceProvider } from './context/PresenceContext';
import EntryExperience from './entry/EntryExperience';
import AccessStatusScreen from './auth/AccessStatusScreen';
import Gate from './auth/Gate';
import DashboardHome from './dashboard/DashboardHome';
import AdminDashboard from './admin/AdminDashboard';

export default function App() {
  return (
    <div className="w-full max-w-full overflow-x-hidden min-h-screen">
      <AuthProvider>
        <PresenceProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<EntryExperience />} />
              <Route path="/access" element={<AccessStatusScreen />} />
              <Route
                path="/dashboard"
                element={
                  <Gate allow={['admin', 'approved']}>
                    <DashboardHome />
                  </Gate>
                }
              />
              <Route
                path="/admin"
                element={
                  <Gate allow={['admin']}>
                    <AdminDashboard />
                  </Gate>
                }
              />
            </Routes>
          </BrowserRouter>
        </PresenceProvider>
      </AuthProvider>
    </div>
  );
}
