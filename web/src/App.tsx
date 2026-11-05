import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, BootScreen, RequireRole } from './components/Shell';
import { Landing } from './pages/Landing';
import { CitizenLogin, StaffLogin, Register } from './pages/auth/Auth';
import { NotFound } from './pages/NotFound';

const CitizenHome = lazy(() => import('./pages/citizen/Home'));
const NewComplaint = lazy(() => import('./pages/citizen/NewComplaint'));
const CitizenCase = lazy(() => import('./pages/citizen/CitizenCase'));
const Account = lazy(() => import('./pages/Account'));
const Overview = lazy(() => import('./pages/admin/Overview'));
const Queue = lazy(() => import('./pages/admin/Queue'));
const Registry = lazy(() => import('./pages/admin/Registry'));
const CaseFile = lazy(() => import('./pages/admin/CaseFile'));
const Insights = lazy(() => import('./pages/admin/Insights'));
const Users = lazy(() => import('./pages/admin/Users'));
const Departments = lazy(() => import('./pages/admin/Departments'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const Audit = lazy(() => import('./pages/admin/Audit'));

export function App() {
  return (
    <Suspense fallback={<BootScreen />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<CitizenLogin />} />
        <Route path="/register" element={<Register />} />
        <Route path="/staff/login" element={<StaffLogin />} />

        <Route path="/app" element={<RequireRole roles={['citizen']}><AppShell /></RequireRole>}>
          <Route index element={<CitizenHome />} />
          <Route path="new" element={<NewComplaint />} />
          <Route path="c/:id" element={<CitizenCase />} />
          <Route path="settings" element={<Account />} />
        </Route>

        <Route path="/admin" element={<RequireRole roles={['admin']}><AppShell /></RequireRole>}>
          <Route index element={<Overview />} />
          <Route path="queue" element={<Queue />} />
          <Route path="complaints" element={<Registry />} />
          <Route path="escalations" element={<Registry preset="escalations" />} />
          <Route path="c/:id" element={<CaseFile />} />
          <Route path="insights" element={<Insights />} />
          <Route path="users" element={<Users />} />
          <Route path="departments" element={<Departments />} />
          <Route path="settings" element={<Settings />} />
          <Route path="audit" element={<Audit />} />
          <Route path="account" element={<Account />} />
        </Route>

        <Route path="/desk" element={<RequireRole roles={['officer']}><AppShell /></RequireRole>}>
          <Route index element={<Overview />} />
          <Route path="cases" element={<Registry />} />
          <Route path="escalations" element={<Registry preset="escalations" />} />
          <Route path="c/:id" element={<CaseFile />} />
          <Route path="settings" element={<Account />} />
        </Route>

        <Route path="/track" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
