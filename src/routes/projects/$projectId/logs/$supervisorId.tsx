import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Calendar } from '@/components/ui/calendar'
import { getSupervisor, getLogs, checkForNewLogs } from '@/server/api'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Search,
  Filter,
  Calendar as CalendarIcon,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Bell,
  FileCode,
  ChevronRight,
  Info,
  Bug,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react'
import { format } from 'date-fns'

export const Route = createFileRoute('/projects/$projectId/logs/$supervisorId')({
  component: LogViewerPage,
})

interface Supervisor {
  id: number
  project_id: number
  name: string
  config_path: string
  log_path: string | null
}

interface ConfigInfo {
  programName: string
  command: string
  directory?: string
  autostart?: boolean
  autorestart?: boolean
  numprocs?: number
  stdoutLogfile?: string
  stderrLogfile?: string
}

interface LogEntry {
  timestamp: string | null
  level: 'error' | 'warning' | 'info' | 'debug'
  message: string
  raw: string
  lineNumber?: number
}

type LogLevel = 'all' | 'error' | 'warning' | 'info' | 'debug'

function LogViewerPage() {
  const { projectId, supervisorId } = Route.useParams()
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null)
  const [configInfo, setConfigInfo] = useState<ConfigInfo | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all')
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()
  const [hotReload, setHotReload] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [newLogsCount, setNewLogsCount] = useState(0)
  const [pendingLogs, setPendingLogs] = useState<LogEntry[]>([])
  const [showConfigInfo, setShowConfigInfo] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastLineNumberRef = useRef<number>(0)

  const loadSupervisor = useCallback(async () => {
    try {
      const result = await getSupervisor({ data: { id: parseInt(supervisorId) } })
      setSupervisor(result.supervisor as Supervisor)
      setConfigInfo(result.configInfo as ConfigInfo | null)
    } catch {
      toast.error('Failed to load supervisor')
    }
  }, [supervisorId])

  const loadLogs = useCallback(async () => {
    if (!supervisor) return

    try {
      const result = await getLogs({
        data: {
          supervisorId: supervisor.id,
          logType: 'stdout',
          startLine: 0,
          maxLines: 500,
          search: search || undefined,
          level: levelFilter,
          startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
          endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
        },
      })
      const entries = (result.entries || []) as LogEntry[]
      setLogs(entries)
      // Track the last line number for tailing
      if (entries.length > 0) {
        const maxLineNumber = Math.max(...entries.map(e => e.lineNumber || 0))
        lastLineNumberRef.current = maxLineNumber > 0 ? maxLineNumber : result.totalLines || entries.length
      } else {
        lastLineNumberRef.current = result.totalLines || 0
      }
      // Clear any pending new logs notification
      setNewLogsCount(0)
      setPendingLogs([])
      setLoading(false)
    } catch {
      toast.error('Failed to load logs')
      setLoading(false)
    }
  }, [supervisor, search, levelFilter, startDate, endDate])

  const checkNewLogsHandler = useCallback(async () => {
    if (!supervisor) return

    try {
      const result = await checkForNewLogs({
        data: {
          supervisorId: supervisor.id,
          lastLineNumber: lastLineNumberRef.current,
          fetchEntries: true,
        },
      })

      if (result.newCount > 0) {
        setNewLogsCount(result.newCount)
        if (result.entries) {
          setPendingLogs(result.entries as LogEntry[])
        }
      }
    } catch {
      // Silent fail for polling
    }
  }, [supervisor])

  const loadNewLogs = useCallback(() => {
    if (pendingLogs.length > 0) {
      setLogs(prev => [...prev, ...pendingLogs])
      // Update last line number
      const maxLineNumber = Math.max(...pendingLogs.map(e => e.lineNumber || 0))
      if (maxLineNumber > lastLineNumberRef.current) {
        lastLineNumberRef.current = maxLineNumber
      }
      setNewLogsCount(0)
      setPendingLogs([])
      // Auto scroll to top if enabled (since logs are displayed newest-first)
      if (autoScroll && scrollRef.current) {
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = 0
          }
        }, 100)
      }
    }
  }, [pendingLogs, autoScroll])

  useEffect(() => {
    loadSupervisor()
  }, [loadSupervisor])

  useEffect(() => {
    if (supervisor) {
      loadLogs()
    }
  }, [supervisor, loadLogs])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on log changes
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0 // Scroll to top since newest logs are first
    }
  }, [autoScroll, logs])

  useEffect(() => {
    if (hotReload && supervisor?.log_path) {
      // Poll for new logs every 2 seconds
      pollIntervalRef.current = setInterval(() => {
        checkNewLogsHandler()
      }, 2000)
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [hotReload, supervisor?.log_path, checkNewLogsHandler])

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpanded(newExpanded)
  }

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />
      case 'debug':
        return <Bug className="h-4 w-4 text-gray-500" />
    }
  }

  const getLevelBadgeColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'bg-red-500'
      case 'warning':
        return 'bg-yellow-500'
      case 'info':
        return 'bg-blue-500'
      case 'debug':
        return 'bg-gray-500'
    }
  }

  const filteredLogs = [...logs]
    .reverse() // Show newest logs first
    .filter((log) => {
      if (levelFilter !== 'all' && log.level !== levelFilter) return false
      if (search && !log.raw.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })

  const exportLogs = (exportFormat: 'txt' | 'json' | 'csv') => {
    if (filteredLogs.length === 0) {
      toast.error('No logs to export')
      return
    }

    let content: string
    let mimeType: string
    let extension: string

    switch (exportFormat) {
      case 'json':
        content = JSON.stringify(filteredLogs, null, 2)
        mimeType = 'application/json'
        extension = 'json'
        break
      case 'csv': {
        const headers = ['timestamp', 'level', 'message']
        const rows = filteredLogs.map((log) => [
          log.timestamp || '',
          log.level,
          `"${(log.message || log.raw).replace(/"/g, '""')}"`,
        ])
        content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
        mimeType = 'text/csv'
        extension = 'csv'
        break
      }
      default:
        content = filteredLogs.map((log) => log.raw).join('\n')
        mimeType = 'text/plain'
        extension = 'txt'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${supervisor?.name || 'logs'}-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.${extension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${filteredLogs.length} log entries`)
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-muted-foreground">Loading logs...</div>
        </div>
      </AppLayout>
    )
  }

  if (!supervisor) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-medium mb-2">Supervisor not found</h2>
          <Link to="/projects/$projectId" params={{ projectId }}>
            <Button variant="link">Back to project</Button>
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-4 h-full flex flex-col">
        <div className="flex items-center gap-4">
          <Link to="/projects/$projectId" params={{ projectId }}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{supervisor.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">{supervisor.log_path}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="hot-reload"
                checked={hotReload}
                onCheckedChange={setHotReload}
              />
              <Label htmlFor="hot-reload" className="flex items-center gap-1 text-sm">
                <RefreshCw className={`h-4 w-4 ${hotReload ? 'animate-spin text-primary' : ''}`} />
                Hot Reload
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="auto-scroll"
                checked={autoScroll}
                onCheckedChange={setAutoScroll}
              />
              <Label htmlFor="auto-scroll" className="text-sm">Auto-scroll</Label>
            </div>
          </div>
        </div>

        {configInfo && (
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setShowConfigInfo(!showConfigInfo)}
              >
                <ChevronRight className={`h-4 w-4 transition-transform ${showConfigInfo ? 'rotate-90' : ''}`} />
                <FileCode className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Supervisor Config Info</span>
                <Badge variant="secondary" className="ml-2">{configInfo.programName}</Badge>
              </button>
              {showConfigInfo && (
                <div className="mt-3 pl-6 space-y-2 text-sm">
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-muted-foreground">Program:</span>
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{configInfo.programName}</code>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-muted-foreground">Command:</span>
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">{configInfo.command}</code>
                  </div>
                  {configInfo.directory && (
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-muted-foreground">Directory:</span>
                      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{configInfo.directory}</code>
                    </div>
                  )}
                  {configInfo.numprocs && configInfo.numprocs > 1 && (
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-muted-foreground">Processes:</span>
                      <span>{configInfo.numprocs}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-muted-foreground">Auto-start:</span>
                    <Badge variant={configInfo.autostart ? 'default' : 'secondary'} className="w-fit">
                      {configInfo.autostart ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-muted-foreground">Auto-restart:</span>
                    <Badge variant={configInfo.autorestart ? 'default' : 'secondary'} className="w-fit">
                      {configInfo.autorestart ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  {configInfo.stdoutLogfile && (
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-muted-foreground">Stdout Log:</span>
                      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">{configInfo.stdoutLogfile}</code>
                    </div>
                  )}
                  {configInfo.stderrLogfile && (
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-muted-foreground">Stderr Log:</span>
                      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">{configInfo.stderrLogfile}</code>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as LogLevel)}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Log level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="debug">Debug</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      {startDate ? format(startDate, 'MMM d') : 'Start'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground">-</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      {endDate ? format(endDate, 'MMM d') : 'End'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                    />
                  </PopoverContent>
                </Popover>
                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStartDate(undefined)
                      setEndDate(undefined)
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>

              <Button onClick={() => loadLogs()} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => exportLogs('txt')}>
                    Export as TXT
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportLogs('json')}>
                    Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportLogs('csv')}>
                    Export as CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{filteredLogs.length} log entries</span>
          {hotReload && (
            <Badge variant="outline" className="animate-pulse">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Live
            </Badge>
          )}
        </div>

        {newLogsCount > 0 && (
          <button
            type="button"
            onClick={loadNewLogs}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg text-primary text-sm font-medium transition-colors"
          >
            <Bell className="h-4 w-4" />
            <span>+{newLogsCount} new {newLogsCount === 1 ? 'line' : 'lines'} available</span>
            <span className="text-primary/70">— Click to load</span>
          </button>
        )}

        <Card className="flex-1 overflow-hidden">
          <ScrollArea className="h-[calc(100vh-380px)]" ref={scrollRef}>
            <div className="p-4 space-y-1">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {logs.length === 0 ? 'No logs found' : 'No logs match the current filters'}
                </div>
              ) : (
                filteredLogs.map((log, index) => (
                  <div
                    key={`${log.timestamp}-${index}`}
                    className={`group font-mono text-sm p-2 rounded hover:bg-muted/50 ${
                      log.level === 'error' ? 'bg-red-500/5' : ''
                    } ${log.level === 'warning' ? 'bg-yellow-500/5' : ''}`}
                  >
                    <button
                      type="button"
                      className="flex items-start gap-2 cursor-pointer w-full text-left"
                      onClick={() => toggleExpand(index)}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {getLevelIcon(log.level)}
                      </div>
                      {log.timestamp && (
                        <span className="text-muted-foreground flex-shrink-0 text-xs">
                          {log.timestamp}
                        </span>
                      )}
                      <Badge
                        variant="secondary"
                        className={`${getLevelBadgeColor(log.level)} text-white text-xs flex-shrink-0`}
                      >
                        {log.level}
                      </Badge>
                      <span
                        className={`flex-1 break-all ${expanded.has(index) ? '' : 'line-clamp-1'}`}
                      >
                        {log.message || log.raw}
                      </span>
                      <span className="h-5 w-5 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                        {expanded.has(index) ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </span>
                    </button>
                    {expanded.has(index) && log.message !== log.raw && (
                      <pre className="mt-2 ml-6 p-2 bg-muted rounded text-xs overflow-x-auto">
                        {log.raw}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </AppLayout>
  )
}
