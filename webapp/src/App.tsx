import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Invite } from './pages/Invite'
import { DashboardLayout } from './pages/dashboard/Layout'
import { Home } from './pages/dashboard/Home'
import { Activity } from './pages/dashboard/Activity'
import { Approvals } from './pages/dashboard/Approvals'
import { Partners } from './pages/dashboard/Partners'
import { Settings } from './pages/dashboard/Settings'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/invite/:token" element={<Invite />} />

        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="activity" element={<Activity />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="partners" element={<Partners />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard/home" replace />} />
        <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
