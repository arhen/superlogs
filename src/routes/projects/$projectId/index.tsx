import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { getProjectsWithSupervisors, updateProject, createSupervisor, deleteSupervisor, detectSupervisor } from '@/server/api'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, FileText, Settings, Search, RefreshCw } from 'lucide-react'

export const Route = createFileRoute('/projects/$projectId/')({
  component: ProjectDetailPage,
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

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [supervisorDialogOpen, setSupervisorDialogOpen] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    environment: 'local' as Environment,
  })
  const [newSupervisor, setNewSupervisor] = useState({
    name: '',
    config_path: '',
    log_path: '',
  })
  const [detectedConfigs, setDetectedConfigs] = useState<
    Array<{
      name: string
      filename: string
      path: string
      programs: Array<{ name: string; stdout_logfile?: string; stderr_logfile?: string }>
    }>
  >([])

  const loadProject = useCallback(async () => {
    try {
      const result = await getProjectsWithSupervisors()
      const projects = result.projects as Project[]
      const found = projects.find((p) => p.id === Number(projectId))
      if (found) {
        setProject(found)
        setEditForm({
          name: found.name,
          description: found.description || '',
          environment: found.environment,
        })
      } else {
        toast.error('Project not found')
        navigate({ to: '/' })
      }
    } catch {
      toast.error('Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId, navigate])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  const handleUpdateProject = async () => {
    if (!project) return
    try {
      await updateProject({
        data: {
          id: project.id,
          name: editForm.name,
          description: editForm.description || undefined,
          environment: editForm.environment,
        },
      })
      toast.success('Project updated')
      setEditDialogOpen(false)
      loadProject()
    } catch {
      toast.error('Failed to update project')
    }
  }

  const handleDetectSupervisor = async () => {
    setDetecting(true)
    try {
      const result = await detectSupervisor()
      if (result.configFiles && result.configFiles.length > 0) {
        setDetectedConfigs(result.configFiles)
        // Don't auto-select, let user choose
        setNewSupervisor({
          name: '',
          config_path: '',
          log_path: '',
        })
        toast.success(`Found ${result.configFiles.length} config files. Select one below.`)
      } else if (result.configPaths.length > 0) {
        setDetectedConfigs([])
        setNewSupervisor({
          name: '',
          config_path: result.configPaths[0],
          log_path: result.logPaths[0] || '',
        })
        toast.success('Config path found! Please enter a name.')
      } else {
        setDetectedConfigs([])
        toast.info('No supervisor configuration found. Please enter manually.')
      }
    } catch {
      toast.error('Detection failed')
    } finally {
      setDetecting(false)
    }
  }

  const handleSelectConfig = (configName: string) => {
    const config = detectedConfigs.find((c) => c.name === configName)
    if (config) {
      const firstProgram = config.programs[0]
      setNewSupervisor({
        name: '', // User provides custom name
        config_path: config.path,
        log_path: firstProgram?.stdout_logfile || '',
      })
    }
  }

  const handleAddSupervisor = async () => {
    if (!project || !newSupervisor.name.trim() || !newSupervisor.config_path.trim()) {
      toast.error('Name and config path are required')
      return
    }

    try {
      await createSupervisor({
        data: {
          projectId: project.id,
          name: newSupervisor.name,
          configPath: newSupervisor.config_path,
          logPath: newSupervisor.log_path || '/var/log/supervisor',
        },
      })
      toast.success('Supervisor added')
      setSupervisorDialogOpen(false)
      setNewSupervisor({ name: '', config_path: '', log_path: '' })
      loadProject()
    } catch {
      toast.error('Failed to add supervisor')
    }
  }

  const handleDeleteSupervisor = async (id: number, name: string) => {
    if (!confirm(`Delete supervisor "${name}"?`)) return
    try {
      await deleteSupervisor({ data: { id } })
      toast.success('Supervisor deleted')
      loadProject()
    } catch {
      toast.error('Failed to delete supervisor')
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

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-muted-foreground">Loading project...</div>
        </div>
      </AppLayout>
    )
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Project not found</p>
          <Button asChild className="mt-4">
            <Link to="/">Go back</Link>
          </Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <Badge variant="secondary" className={`${getEnvironmentColor(project.environment)} text-white`}>
                {project.environment}
              </Badge>
            </div>
            {project.description && (
              <p className="text-muted-foreground mt-1">{project.description}</p>
            )}
          </div>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Edit Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Project</DialogTitle>
                <DialogDescription>Update project details</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-environment">Environment</Label>
                  <Select
                    value={editForm.environment}
                    onValueChange={(value) => setEditForm({ ...editForm, environment: value as Environment })}
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
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateProject}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Supervisors</h2>
          <Dialog open={supervisorDialogOpen} onOpenChange={setSupervisorDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Supervisor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Supervisor</DialogTitle>
                <DialogDescription>Add a new supervisor to this project</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDetectSupervisor}
                  disabled={detecting}
                >
                  {detecting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Auto-detect Supervisor
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or enter manually</span>
                  </div>
                </div>
                {detectedConfigs.length > 0 && (
                  <div className="space-y-2">
                    <Label>Select Config File</Label>
                    <Select onValueChange={handleSelectConfig}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a config file" />
                      </SelectTrigger>
                      <SelectContent>
                        {detectedConfigs.map((config) => (
                          <SelectItem key={config.name} value={config.name}>
                            {config.filename}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Found {detectedConfigs.length} config files
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="sup-name">Name</Label>
                  <Input
                    id="sup-name"
                    value={newSupervisor.name}
                    onChange={(e) => setNewSupervisor({ ...newSupervisor, name: e.target.value })}
                    placeholder="e.g. Production API Server"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sup-config">Config Path</Label>
                  <Input
                    id="sup-config"
                    value={newSupervisor.config_path}
                    onChange={(e) => setNewSupervisor({ ...newSupervisor, config_path: e.target.value })}
                    placeholder="/etc/supervisor/supervisord.conf"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sup-log">Log Path</Label>
                  <Input
                    id="sup-log"
                    value={newSupervisor.log_path}
                    onChange={(e) => setNewSupervisor({ ...newSupervisor, log_path: e.target.value })}
                    placeholder="/var/log/supervisor/app-stdout.log"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSupervisorDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddSupervisor}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {project.supervisors.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No supervisors configured</h3>
              <p className="text-muted-foreground text-center mb-4">
                Add a supervisor to start viewing logs
              </p>
              <Button onClick={() => setSupervisorDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Supervisor
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {project.supervisors.map((sup) => (
              <Card key={sup.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">
                      <Link
                        to="/projects/$projectId/logs/$supervisorId"
                        params={{ projectId: String(project.id), supervisorId: String(sup.id) }}
                        className="hover:underline"
                      >
                        {sup.name}
                      </Link>
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteSupervisor(sup.id, sup.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Config: </span>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{sup.config_path}</code>
                  </div>
                  {sup.log_path && (
                    <div>
                      <span className="text-muted-foreground">Logs: </span>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{sup.log_path}</code>
                    </div>
                  )}
                  <div className="pt-2">
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <Link
                        to="/projects/$projectId/logs/$supervisorId"
                        params={{ projectId: String(project.id), supervisorId: String(sup.id) }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        View Logs
                      </Link>
                    </Button>
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
