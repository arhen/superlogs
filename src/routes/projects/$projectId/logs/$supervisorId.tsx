import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { getSupervisor, getLogsFromEnd, checkForNewLogs } from '@/server/api'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Search,
  Calendar as CalendarIcon,
  RefreshCw,
  Bell,
  FileCode,
  ChevronRight,
  ChevronDown,
  Download,
  Terminal,
  Zap,
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
  const [showConfigInfo, setShowConfigInfo] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalLines, setTotalLines] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastLineNumberRef = useRef<number>(0)
  const oldestLineRef = useRef<number>(0)

  const loadSupervisor = useCallback(async () => {
    try {
      const result = await getSupervisor({ data: { id: parseInt(supervisorId, 10) } })
      setSupervisor(result.supervisor as Supervisor)
      setConfigInfo(result.configInfo as ConfigInfo | null)
    } catch {
      toast.error('Failed to load supervisor')
    }
  }, [supervisorId])

  const loadLogs = useCallback(async () => {
    if (!supervisor) return

    try {
      const result = await getLogsFromEnd({
        data: {
          supervisorId: supervisor.id,
          logType: 'stdout',
          limit: 500,
          search: search || undefined,
          level: levelFilter,
          startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
          endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
        },
      })
      const entries = (result.entries || []) as LogEntry[]
      setLogs(entries)
      setHasMore(result.hasMore || false)
      setTotalLines(result.totalLines || 0)
      lastLineNumberRef.current = result.newestLineLoaded || 0
      oldestLineRef.current = result.oldestLineLoaded || 0
      setNewLogsCount(0)
      setPendingLogs([])
      setLoading(false)
    } catch {
      toast.error('Failed to load logs')
      setLoading(false)
    }
  }, [supervisor, search, levelFilter, startDate, endDate])

  // Load older logs when scrolling up
  const loadOlderLogs = useCallback(async () => {
    if (!supervisor || loadingMore || !hasMore) return

    setLoadingMore(true)
    try {
      const result = await getLogsFromEnd({
        data: {
          supervisorId: supervisor.id,
          logType: 'stdout',
          limit: 500,
          beforeLine: oldestLineRef.current,
          search: search || undefined,
          level: levelFilter,
          startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
          endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
        },
      })
      const entries = (result.entries || []) as LogEntry[]
      if (entries.length > 0) {
        // Prepend older logs (they go at the end since we display reversed)
        setLogs(prev => [...entries, ...prev])
        oldestLineRef.current = result.oldestLineLoaded || 0
      }
      setHasMore(result.hasMore || false)
    } catch {
      toast.error('Failed to load more logs')
    } finally {
      setLoadingMore(false)
    }
  }, [supervisor, loadingMore, hasMore, search, levelFilter, startDate, endDate])

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
      const maxLineNumber = Math.max(...pendingLogs.map(e => e.lineNumber || 0))
      if (maxLineNumber > lastLineNumberRef.current) {
        lastLineNumberRef.current = maxLineNumber
      }
      setNewLogsCount(0)
      setPendingLogs([])
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
      scrollRef.current.scrollTop = 0
    }
  }, [autoScroll, logs])

  useEffect(() => {
    if (hotReload && supervisor?.log_path) {
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

  // Infinite scroll - load older logs when scrolling near bottom
  // (since newest is at top, older logs are at the bottom)
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || loadingMore || !hasMore) return

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    // Load more when user scrolls to within 200px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadOlderLogs()
    }
  }, [loadingMore, hasMore, loadOlderLogs])

  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    scrollEl.addEventListener('scroll', handleScroll)
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpanded(newExpanded)
  }

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'log-error'
      case 'warning':
        return 'log-warning'
      case 'info':
        return 'log-info'
      case 'debug':
        return 'log-debug'
    }
  }

  const getLevelPrefix = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'ERR'
      case 'warning':
        return 'WRN'
      case 'info':
        return 'INF'
      case 'debug':
        return 'DBG'
    }
  }

  const filteredLogs = [...logs]
    .reverse()
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
          <div className="text-primary">
            <span className="animate-pulse">_</span> loading logs...
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!supervisor) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">supervisor not found</p>
          <Link to="/projects/$projectId" params={{ projectId }}>
            <Button variant="ghost" size="sm">back to project</Button>
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="h-full flex flex-col gap-3 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link to="/projects/$projectId" params={{ projectId }}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-primary" />
              <h1 className="text-sm font-medium truncate">{supervisor.name}</h1>
              {hotReload && (
                <Badge variant="success" className="text-[10px] px-1.5 py-0">
                  <Zap className="h-2.5 w-2.5 mr-0.5" />
                  live
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{supervisor.log_path}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Switch
                id="hot-reload"
                checked={hotReload}
                onCheckedChange={setHotReload}
                className="scale-75"
              />
              <Label htmlFor="hot-reload" className="text-[11px] text-muted-foreground cursor-pointer">
                tail -f
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch
                id="auto-scroll"
                checked={autoScroll}
                onCheckedChange={setAutoScroll}
                className="scale-75"
              />
              <Label htmlFor="auto-scroll" className="text-[11px] text-muted-foreground cursor-pointer">
                scroll
              </Label>
            </div>
          </div>
        </div>

        {/* Config Info Panel */}
        {configInfo && (
          <div className="border border-border bg-card/50 flex-shrink-0">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setShowConfigInfo(!showConfigInfo)}
            >
              <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${showConfigInfo ? 'rotate-90' : ''}`} />
              <FileCode className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">config</span>
              <code className="text-[11px] text-primary">{configInfo.programName}</code>
            </button>
            {showConfigInfo && (
              <div className="px-3 pb-3 pt-1 space-y-1 text-[11px] border-t border-border">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-16">cmd:</span>
                  <code className="text-foreground break-all">{configInfo.command}</code>
                </div>
                {configInfo.directory && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-16">dir:</span>
                    <code className="text-foreground">{configInfo.directory}</code>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-16">autostart:</span>
                  <span className={configInfo.autostart ? 'text-green-400' : 'text-zinc-500'}>
                    {configInfo.autostart ? 'true' : 'false'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-16">restart:</span>
                  <span className={configInfo.autorestart ? 'text-green-400' : 'text-zinc-500'}>
                    {configInfo.autorestart ? 'true' : 'false'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border flex-shrink-0">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="grep..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs"
            />
          </div>

          <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as LogLevel)}>
            <SelectTrigger className="w-[100px] h-7 text-xs">
              <SelectValue placeholder="level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">all</SelectItem>
              <SelectItem value="error" className="text-xs log-error">error</SelectItem>
              <SelectItem value="warning" className="text-xs log-warning">warning</SelectItem>
              <SelectItem value="info" className="text-xs log-info">info</SelectItem>
              <SelectItem value="debug" className="text-xs log-debug">debug</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {startDate ? format(startDate, 'MM/dd') : 'from'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-xs">-</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                  {endDate ? format(endDate, 'MM/dd') : 'to'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} />
              </PopoverContent>
            </Popover>
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 text-muted-foreground"
                onClick={() => {
                  setStartDate(undefined)
                  setEndDate(undefined)
                }}
              >
                clear
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[11px] text-muted-foreground">
              {filteredLogs.length}{totalLines > 0 ? `/${totalLines}` : ''} lines
              {hasMore && ' ...'}
            </span>
            <Button onClick={() => loadLogs()} variant="ghost" size="sm" className="h-7 px-2">
              <RefreshCw className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <Download className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportLogs('txt')} className="text-xs">
                  export .txt
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLogs('json')} className="text-xs">
                  export .json
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLogs('csv')} className="text-xs">
                  export .csv
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* New logs notification */}
        {newLogsCount > 0 && (
          <button
            type="button"
            onClick={loadNewLogs}
            className="flex items-center justify-center gap-2 py-1.5 px-3 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs transition-colors flex-shrink-0"
          >
            <Bell className="h-3 w-3" />
            <span>+{newLogsCount} new {newLogsCount === 1 ? 'line' : 'lines'}</span>
            <span className="text-primary/60">click to load</span>
          </button>
        )}

        {/* Log entries - Terminal style - This is the only scrollable area */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-auto bg-log-bg border border-border"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
              {logs.length === 0 ? '// no logs found' : '// no matches'}
            </div>
          ) : (
            <div className="p-2 space-y-px">
                {filteredLogs.map((log, index) => (
                  <div
                    key={`${log.lineNumber}-${index}`}
                    className={`group text-[11px] leading-relaxed hover:bg-muted/30 ${
                      log.level === 'error' ? 'bg-destructive/5' : ''
                    } ${log.level === 'warning' ? 'bg-warning/5' : ''}`}
                  >
                    <button
                      type="button"
                      className="flex items-start gap-2 w-full text-left px-2 py-0.5"
                      onClick={() => toggleExpand(index)}
                    >
                      {/* Line number */}
                      <span className="text-log-line-number w-8 text-right flex-shrink-0 select-none">
                        {log.lineNumber || index + 1}
                      </span>
                      {/* Timestamp */}
                      {log.timestamp && (
                        <span className="text-muted-foreground flex-shrink-0">
                          {log.timestamp}
                        </span>
                      )}
                      {/* Level */}
                      <span className={`${getLevelColor(log.level)} flex-shrink-0 font-medium w-7`}>
                        {getLevelPrefix(log.level)}
                      </span>
                      {/* Message */}
                      <span className={`flex-1 text-foreground ${expanded.has(index) ? 'whitespace-pre-wrap' : 'truncate'}`}>
                        {log.message || log.raw}
                      </span>
                      {/* Expand indicator */}
                      <ChevronDown
                        className={`h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ${
                          expanded.has(index) ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {/* Raw output */}
                    {expanded.has(index) && log.message !== log.raw && (
                      <pre className="ml-12 mr-2 mb-1 p-2 bg-muted/50 text-muted-foreground text-[10px] overflow-x-auto border-l-2 border-border">
                        {log.raw}
                      </pre>
                    )}
                  </div>
                ))}
                {/* Loading indicator for infinite scroll */}
                {loadingMore && (
                  <div className="flex items-center justify-center py-3 text-muted-foreground text-xs">
                    <RefreshCw className="h-3 w-3 animate-spin mr-2" />
                    loading older logs...
                  </div>
                )}
                {/* End of logs indicator */}
                {!hasMore && filteredLogs.length > 0 && (
                  <div className="text-center py-2 text-muted-foreground text-[10px]">
                    {'// end of logs'}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
