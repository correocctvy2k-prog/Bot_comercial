import { ThemeProvider } from "@/components/theme-provider"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import Dashboard from './pages/Dashboard'
import Connections from './pages/Connections'
import BotConfig from './pages/BotConfig'
import Points from './pages/Points'
import Contacts from './pages/Contacts'
import ContactDetail from './pages/ContactDetail'
import CommandCenter from './pages/CommandCenter'
import AsambleaDashboard from './pages/AsambleaDashboard'
import PruebaWhatsApp from './pages/PruebaWhatsApp'
import LoginPage from './pages/LoginPage'
import UsersDashboard from './pages/UsersDashboard'
import Layout from './layout/Layout'

const queryClient = new QueryClient()

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Ruta pública */}
              <Route path="/login" element={<LoginPage />} />

              {/* Rutas protegidas envueltas en Layout */}
              <Route path="/*" element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<ProtectedRoute module="bot-activity"><Dashboard /></ProtectedRoute>} />
                      <Route path="/points" element={<ProtectedRoute module="points"><Points /></ProtectedRoute>} />
                      <Route path="/connections" element={<ProtectedRoute module="settings"><Connections /></ProtectedRoute>} />
                      <Route path="/connections/:id/config" element={<ProtectedRoute module="settings"><BotConfig /></ProtectedRoute>} />
                      <Route path="/contacts" element={<ProtectedRoute module="contacts"><Contacts /></ProtectedRoute>} />
                      <Route path="/contacts/:id" element={<ProtectedRoute module="contacts"><ContactDetail /></ProtectedRoute>} />
                      <Route path="/command-center" element={<ProtectedRoute module="command-center"><CommandCenter /></ProtectedRoute>} />
                      <Route path="/asamblea" element={<ProtectedRoute module="asamblea"><AsambleaDashboard /></ProtectedRoute>} />
                      <Route path="/users" element={<ProtectedRoute module="users-management"><UsersDashboard /></ProtectedRoute>} />
                      <Route path="/test-wa" element={<ProtectedRoute module="settings"><PruebaWhatsApp /></ProtectedRoute>} />
                      
                      {/* Fallback */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              } />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
