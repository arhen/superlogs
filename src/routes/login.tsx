import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from '@/server/auth'
import { toast } from 'sonner'
import { Terminal } from 'lucide-react'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await login({ data: { username, password } })
      if (result.success) {
        toast.success('logged in')
        navigate({ to: '/' })
      } else {
        toast.error(result.error || 'login failed')
      }
    } catch {
      toast.error('an error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-xs">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Terminal className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium uppercase tracking-wider">superlogs</span>
          </div>
          <p className="text-xs text-muted-foreground">supervisor log viewer</p>
        </div>

        {/* Form */}
        <div className="border border-border p-4 bg-card">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs">username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
                className="h-8 text-xs"
              />
            </div>
            <Button type="submit" className="w-full h-8 text-xs" disabled={loading}>
              {loading ? 'authenticating...' : 'login'}
            </Button>
          </form>
        </div>


      </div>
    </div>
  )
}
