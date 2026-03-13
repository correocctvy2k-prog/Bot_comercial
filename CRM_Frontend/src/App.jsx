import PruebaWhatsApp from './pages/PruebaWhatsApp'
import Layout from './layout/Layout'
import Dashboard from './pages/Dashboard'
import Connections from './pages/Connections'
import BotConfig from './pages/BotConfig'
import Points from './pages/Points'
import Contacts from './pages/Contacts'
import ContactDetail from './pages/ContactDetail'
import CommandCenter from './pages/CommandCenter'
import AsambleaDashboard from './pages/AsambleaDashboard'
import { ThemeProvider } from "@/components/theme-provider"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from "react-router-dom";

const queryClient = new QueryClient()

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/points" element={<Points />} />
              <Route path="/connections" element={<Connections />} />
              <Route path="/connections/:id/config" element={<BotConfig />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/contacts/:id" element={<ContactDetail />} />
              <Route path="/command-center" element={<CommandCenter />} />
              <Route path="/asamblea" element={<AsambleaDashboard />} />
              <Route path="/test-wa" element={<PruebaWhatsApp />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
