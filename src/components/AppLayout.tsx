import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getCurrentUser, logout } from '@/server/auth'
import { toast } from 'sonner'
import { LogOut, User, Settings, FolderOpen, Terminal, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const router = useRouterState()
  const [user, setUser] = useState<{ id: number; username: string } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    getCurrentUser().then((result) => {
      if (result.user) {
        setUser(result.user)
      } else {
        navigate({ to: '/login' })
      }
    })
  }, [navigate])

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark') {
      setDarkMode(true)
      document.documentElement.classList.add('dark')
    } else if (stored === 'light') {
      setDarkMode(false)
      document.documentElement.classList.remove('dark')
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setDarkMode(prefersDark)
      if (prefersDark) {
        document.documentElement.classList.add('dark')
      }
    }
  }, [])

  const toggleTheme = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    localStorage.setItem('theme', newDarkMode ? 'dark' : 'light')
    if (newDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const handleLogout = async () => {
    await logout()
    toast.success('logged out')
    navigate({ to: '/login' })
  }

  const isActive = (path: string) => {
    return router.location.pathname === path || router.location.pathname.startsWith(`${path}/`)
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary text-xs">
          <span className="animate-pulse">_</span> loading
          <span className="loading-dots">
            <span className="dot">.</span>
            <span className="dot">.</span>
            <span className="dot">.</span>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Terminal-style sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-12'} border-r border-border transition-all duration-200 flex flex-col bg-sidebar flex-shrink-0`}
      >
        {/* Logo */}
        <div className="h-12 flex items-center px-3 border-b border-border">
          <Link to="/" className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <Terminal className="h-4 w-4 text-primary flex-shrink-0" />
            {sidebarOpen && (
              <span className="text-xs uppercase tracking-wider font-medium">superlogs</span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          <Link
            to="/"
            className={`flex items-center gap-2 px-2 py-1.5 text-xs transition-colors ${
              isActive('/') && !router.location.pathname.startsWith('/settings')
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
            {sidebarOpen && <span>projects</span>}
          </Link>
          <Link
            to="/settings"
            className={`flex items-center gap-2 px-2 py-1.5 text-xs transition-colors ${
              isActive('/settings')
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Settings className="h-3.5 w-3.5 flex-shrink-0" />
            {sidebarOpen && <span>settings</span>}
          </Link>
        </nav>

        {/* Theme toggle & Collapse */}
        <div className="p-2 border-t border-border space-y-1">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {darkMode ? (
              <>
                <Sun className="h-3 w-3" />
                {sidebarOpen && <span>light mode</span>}
              </>
            ) : (
              <>
                <Moon className="h-3 w-3" />
                {sidebarOpen && <span>dark mode</span>}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {sidebarOpen ? (
              <>
                <ChevronLeft className="h-3 w-3" />
                <span>collapse</span>
              </>
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header */}
        <header className="h-12 border-b border-border flex items-center justify-between px-4 bg-background flex-shrink-0">
          <div className="text-xs text-muted-foreground">
            <span className="text-primary">~</span>
            <span>{router.location.pathname}</span>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                  <User className="h-3 w-3" />
                  <span className="text-muted-foreground">{user.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem asChild className="text-xs">
                  <Link to="/settings">
                    <Settings className="h-3 w-3 mr-2" />
                    settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-xs text-destructive">
                  <LogOut className="h-3 w-3 mr-2" />
                  logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content - flex-1 with overflow hidden, children handle their own scroll */}
        <main className="flex-1 p-4 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
