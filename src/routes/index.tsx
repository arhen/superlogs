import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Plus, Trash2, FolderOpen, Server } from 'lucide-react'

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

  const loadProjects = async () => {
    try {
      const result = await getProjectsWithSupervisors()
      setProjects(result.projects as Project[])
    } catch {
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

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
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return

    try {
      await deleteProject({ data: { id } })
      toast.success('Project deleted')
      loadProjects()
    } catch {
      toast.error('Failed to delete project')
    }
  }

  const getEnvironmentColor = (env: Environment) => {
    const colors = {
      local: 'bg-gray-500',
      development: 'bg-blue-500',
      staging: 'bg-yellow-500',
      production: 'bg-red-500',
    }
    return colors[env] || 'bg-gray-500'
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">Manage your supervisor log projects</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Project</DialogTitle>
                <DialogDescription>Add a new project to organize your supervisors</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    placeholder="My Project"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    placeholder="Project description..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="environment">Environment</Label>
                  <Select
                    value={newProject.environment}
                    onValueChange={(value) => setNewProject({ ...newProject, environment: value as Environment })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateProject}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading projects...</div>
          </div>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No projects yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first project to start monitoring supervisor logs
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: String(project.id) }}
                          className="hover:underline"
                        >
                          {project.name}
                        </Link>
                      </CardTitle>
                      {project.description && (
                        <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteProject(project.id, project.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className={`${getEnvironmentColor(project.environment)} text-white`}>
                      {project.environment}
                    </Badge>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Server className="h-4 w-4 mr-1" />
                      {project.supervisors?.length || 0} supervisor{(project.supervisors?.length || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
