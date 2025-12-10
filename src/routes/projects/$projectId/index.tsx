import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
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
import { getProjectsWithSupervisors, updateProject, createSupervisor, deleteSupervisor, detectSupervisor } from '@/server/api'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, FileText, Settings, Search, RefreshCw, Server, Terminal, ChevronRight } from 'lucide-react'

export const Route = createFileRoute('/projects/$projectId/')({
  component: ProjectDetailPage,
})

type Environment = 'local' | 'development' | 'staging' | 'production'
type LogTemplate = 'default' | 'laravel' | 'fastapi'

interface Supervisor {
  id: number
  name: string
  config_path: string
  log_path: string | null
  log_template: LogTemplate
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
    log_template: 'default' as LogTemplate,
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
        setNewSupervisor({
          name: '',
          config_path: '',
          log_path: '',
          log_template: 'default',
        })
        toast.success(`Found ${result.configFiles.length} config files`)
      } else if (result.configPaths.length > 0) {
        setDetectedConfigs([])
        setNewSupervisor({
          name: '',
          config_path: result.configPaths[0],
          log_path: result.logPaths[0] || '',
        })
        toast.success('Config path found')
      } else {
        setDetectedConfigs([])
        toast.info('No supervisor configuration found')
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
        name: '',
        config_path: config.path,
        log_path: firstProgram?.stdout_logfile || '',
        log_template: newSupervisor.log_template,
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
          logTemplate: newSupervisor.log_template,
        },
      })
      toast.success('Supervisor added')
      setSupervisorDialogOpen(false)
      setNewSupervisor({ name: '', config_path: '', log_path: '', log_template: 'default' })
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

  const getEnvironmentBadge = (env: Environment) => {
    const variants: Record<Environment, 'default' | 'secondary' | 'warning' | 'error'> = {
      local: 'secondary',
      development: 'default',
      staging: 'warning',
      production: 'error',
    }
    return variants[env] || 'secondary'
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-primary text-xs">
            <span className="animate-pulse">_</span> loading...
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground text-xs mb-4">project not found</p>
          <Button asChild size="sm" variant="ghost">
            <Link to="/">go back</Link>
          </Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="h-full flex flex-col gap-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button variant="ghost" size="sm" asChild className="h-7 w-7 p-0">
            <Link to="/">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-primary" />
              <h1 className="text-sm font-medium truncate">{project.name}</h1>
              <Badge variant={getEnvironmentBadge(project.environment)} className="text-[10px]">
                {project.environment}
              </Badge>
            </div>
            {project.description && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{project.description}</p>
            )}
          </div>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <Settings className="h-3 w-3 mr-1" />
                edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-sm">edit project</DialogTitle>
                <DialogDescription className="text-xs">update project details</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-xs">name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-description" className="text-xs">description</Label>
                  <Textarea
                    id="edit-description"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="text-xs min-h-[60px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-environment" className="text-xs">environment</Label>
                  <Select
                    value={editForm.environment}
                    onValueChange={(value) => setEditForm({ ...editForm, environment: value as Environment })}
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
                <Button variant="ghost" size="sm" onClick={() => setEditDialogOpen(false)} className="text-xs">cancel</Button>
                <Button size="sm" onClick={handleUpdateProject} className="text-xs">save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Supervisors section */}
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">supervisors</span>
              <span className="text-xs text-muted-foreground">({project.supervisors.length})</span>
            </div>
            <Dialog open={supervisorDialogOpen} onOpenChange={setSupervisorDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-sm">add supervisor</DialogTitle>
                  <DialogDescription className="text-xs">add a new supervisor to this project</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-3">
                  <Button
                    variant="outline"
                    className="w-full h-8 text-xs"
                    onClick={handleDetectSupervisor}
                    disabled={detecting}
                  >
                    {detecting ? (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3 mr-1" />
                    )}
                    auto-detect
                  </Button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or manual</span>
                    </div>
                  </div>
                  {detectedConfigs.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">select config</Label>
                      <Select onValueChange={handleSelectConfig}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="choose config file" />
                        </SelectTrigger>
                        <SelectContent>
                          {detectedConfigs.map((config) => (
                            <SelectItem key={config.name} value={config.name} className="text-xs">
                              {config.filename}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">
                        found {detectedConfigs.length} configs
                      </p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="sup-name" className="text-xs">name</Label>
                    <Input
                      id="sup-name"
                      value={newSupervisor.name}
                      onChange={(e) => setNewSupervisor({ ...newSupervisor, name: e.target.value })}
                      placeholder="my-app"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sup-config" className="text-xs">config path</Label>
                    <Input
                      id="sup-config"
                      value={newSupervisor.config_path}
                      onChange={(e) => setNewSupervisor({ ...newSupervisor, config_path: e.target.value })}
                      placeholder="/etc/supervisor/conf.d/app.conf"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sup-log" className="text-xs">log path</Label>
                    <Input
                      id="sup-log"
                      value={newSupervisor.log_path}
                      onChange={(e) => setNewSupervisor({ ...newSupervisor, log_path: e.target.value })}
                      placeholder="/var/log/supervisor/app-stdout.log"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sup-template" className="text-xs">log template</Label>
                    <Select
                      value={newSupervisor.log_template}
                      onValueChange={(value) => setNewSupervisor({ ...newSupervisor, log_template: value as LogTemplate })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="select log format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default" className="text-xs">default</SelectItem>
                        <SelectItem value="laravel" className="text-xs">laravel</SelectItem>
                        <SelectItem value="fastapi" className="text-xs">fastapi / uvicorn</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      choose the log format for better parsing
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setSupervisorDialogOpen(false)} className="text-xs">cancel</Button>
                  <Button size="sm" onClick={handleAddSupervisor} className="text-xs">add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {project.supervisors.length === 0 ? (
            <div className="border border-dashed border-border flex-1 flex flex-col items-center justify-center">
              <FileText className="h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground mb-3">no supervisors configured</p>
              <Button size="sm" onClick={() => setSupervisorDialogOpen(true)} className="text-xs h-7">
                <Plus className="h-3 w-3 mr-1" />
                add supervisor
              </Button>
            </div>
          ) : (
            <div className="border border-border divide-y divide-border flex-1 min-h-0 overflow-auto">
              {project.supervisors.map((sup) => (
                <div
                  key={sup.id}
                  className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <Link
                    to="/projects/$projectId/logs/$supervisorId"
                    params={{ projectId: String(project.id), supervisorId: String(sup.id) }}
                    className="flex-1 flex items-center gap-3 min-w-0"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{sup.name}</span>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <code className="text-[10px] text-muted-foreground truncate block">{sup.config_path}</code>
                        {sup.log_path && (
                          <code className="text-[10px] text-zinc-600 truncate block">{sup.log_path}</code>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    onClick={() => handleDeleteSupervisor(sup.id, sup.name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
