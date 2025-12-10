import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getProjectsWithSupervisors, createProject, deleteProject } from '@/server/api'
import { toast } from 'sonner'
import { Plus, Trash2, FolderOpen, Server, ChevronRight, Terminal } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

type Environment = 'local' | 'development' | 'staging' | 'production'

interface Supervisor {
  id: number
  name: string
  config_path: string
  log_path: string | null
}

interface Project {
  id: number
  name: string
  description: string | null
  environment: Environment
  created_at: string
  supervisors: Supervisor[]
}

function HomePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    environment: 'local' as Environment,
  })

  const loadProjects = useCallback(async () => {
    try {
      const result = await getProjectsWithSupervisors()
      setProjects(result.projects as Project[])
    } catch {
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      toast.error('Project name is required')
      return
    }

    try {
      await createProject({
        data: {
          name: newProject.name,
          description: newProject.description || undefined,
          environment: newProject.environment,
        },
      })
      toast.success('Project created')
      setDialogOpen(false)
      setNewProject({ name: '', description: '', environment: 'local' })
      loadProjects()
    } catch {
      toast.error('Failed to create project')
    }
  }

  const handleDeleteProject = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return

    try {
      await deleteProject({ data: { id } })
      toast.success('Project deleted')
      loadProjects()
    } catch {
      toast.error('Failed to delete project')
    }
  }

  const getEnvironmentBadge = (env: Environment) => {
    const variants: Record<Environment, 'default' | 'secondary' | 'warning' | 'error'> = {
      local: 'secondary',
      development: 'default',
      staging: 'warning',
      production: 'error',
    }
    return variants[env] || 'secondary'
  }

  return (
    <AppLayout>
      <div className="h-full flex flex-col gap-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-medium">projects</h1>
            <span className="text-xs text-muted-foreground">({projects.length})</span>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                new
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-sm">create project</DialogTitle>
                <DialogDescription className="text-xs">
                  add a new project to organize supervisors
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs">name</Label>
                  <Input
                    id="name"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    placeholder="my-project"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs">description</Label>
                  <Textarea
                    id="description"
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    placeholder="optional description..."
                    className="text-xs min-h-[60px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="environment" className="text-xs">environment</Label>
                  <Select
                    value={newProject.environment}
                    onValueChange={(value) => setNewProject({ ...newProject, environment: value as Environment })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local" className="text-xs">local</SelectItem>
                      <SelectItem value="development" className="text-xs">development</SelectItem>
                      <SelectItem value="staging" className="text-xs">staging</SelectItem>
                      <SelectItem value="production" className="text-xs">production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} className="text-xs">
                  cancel
                </Button>
                <Button size="sm" onClick={handleCreateProject} className="text-xs">
                  create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="text-primary text-xs">
              <span className="animate-pulse">_</span> loading
              <span className="loading-dots">
                <span className="dot">.</span>
                <span className="dot">.</span>
                <span className="dot">.</span>
              </span>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="border border-dashed border-border flex-1 flex flex-col items-center justify-center">
            <Terminal className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-xs text-muted-foreground mb-3">no projects yet</p>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="text-xs h-7">
              <Plus className="h-3 w-3 mr-1" />
              create project
            </Button>
          </div>
        ) : (
          <div className="border border-border divide-y divide-border flex-1 min-h-0 overflow-auto">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
              >
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: String(project.id) }}
                  className="flex-1 flex items-center gap-3 min-w-0"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{project.name}</span>
                      <Badge variant={getEnvironmentBadge(project.environment)} className="text-[10px]">
                        {project.environment}
                      </Badge>
                    </div>
                    {project.description && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Server className="h-3 w-3" />
                      {project.supervisors?.length || 0}
                    </span>
                    <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  onClick={(e) => {
                    e.preventDefault()
                    handleDeleteProject(project.id, project.name)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
