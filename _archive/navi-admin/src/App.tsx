import { useState, useCallback } from 'react'
import { AuthContext } from './hooks/useAuth'
import { mockUsers, mockCredentials } from './data'
import { AppLayout } from './components/layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { MapEditor } from './pages/MapEditor'
import { BuildingManagement } from './pages/BuildingManagement'
import { FloorManagement } from './pages/FloorManagement'
import { PanoramaManagement } from './pages/PanoramaManagement'
import { QRManagement } from './pages/QRManagement'
import { RouteTesting } from './pages/RouteTesting'
import { DatasetManagement } from './pages/DatasetManagement'
import { LoginScreen } from './pages/LoginScreen'
import type { ScreenName } from './types/screens'
import type { User } from './types'

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const remembered = localStorage.getItem('navi_remember') === 'true';
    const store = remembered ? localStorage : sessionStorage;
    return !!store.getItem('navi_user');
  })
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('dashboard')
  const [user, setUser] = useState<User | null>(() => {
    const remembered = localStorage.getItem('navi_remember') === 'true';
    const stored = (remembered ? localStorage : sessionStorage).getItem('navi_user');
    return stored ? JSON.parse(stored) : null
  })

  const login = useCallback(async (email: string, password: string, rememberMe?: boolean): Promise<boolean> => {
    const remember = rememberMe ?? true;
    if (mockCredentials[email] && mockCredentials[email] === password) {
      const found = mockUsers.find((u) => u.email === email)
      if (found) {
        setUser(found)
        const store = remember ? localStorage : sessionStorage;
        store.setItem('navi_user', JSON.stringify(found))
        localStorage.setItem('navi_remember', String(remember))
        setIsLoggedIn(true)
        return true
      }
    }
    return false
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    const remembered = localStorage.getItem('navi_remember') === 'true';
    (remembered ? localStorage : sessionStorage).removeItem('navi_user');
    (remembered ? sessionStorage : localStorage).removeItem('navi_user');
    setIsLoggedIn(false)
    setCurrentScreen('dashboard')
  }, [])

  if (!isLoggedIn) {
    return (
      <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
        <LoginScreen onLogin={() => setIsLoggedIn(true)} />
      </AuthContext.Provider>
    )
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentScreen} />
      case 'map-editor':
        return <MapEditor />
      case 'buildings':
        return <BuildingManagement />
      case 'floors':
        return <FloorManagement />
      case 'panoramas':
        return <PanoramaManagement />
      case 'qr':
        return <QRManagement />
      case 'routes':
        return <RouteTesting />
      case 'dataset':
        return <DatasetManagement />
      default:
        return <Dashboard onNavigate={setCurrentScreen} />
    }
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      <AppLayout currentScreen={currentScreen} onNavigate={setCurrentScreen}>
        {renderScreen()}
      </AppLayout>
    </AuthContext.Provider>
  )
}
