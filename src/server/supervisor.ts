import fs from 'fs';
import path from 'path';

export interface SupervisorConfig {
  name: string;
  command: string;
  directory?: string;
  autostart?: boolean;
  autorestart?: boolean;
  stdout_logfile?: string;
  stderr_logfile?: string;
  numprocs?: number;
  process_name?: string;
}

const SUPERVISOR_CONFIG_PATHS = [
  '/etc/supervisor/supervisord.conf',
  '/etc/supervisord.conf',
  '/usr/local/etc/supervisord.conf',
  '/etc/supervisor/conf.d',
  '/etc/supervisord.d',
  '/usr/local/etc/supervisor.d',
  '/opt/homebrew/etc/supervisord.conf',
  '/opt/homebrew/etc/supervisor.d',
];

const SUPERVISOR_LOG_PATHS = [
  '/var/log/supervisor',
  '/var/log/supervisord',
  '/tmp/supervisor',
  '/opt/homebrew/var/log/supervisor',
];

export interface DetectedConfigFile {
  name: string; // e.g., "frnd-ai-prod-service"
  filename: string; // e.g., "frnd-ai-prod-service.conf"
  path: string; // e.g., "/etc/supervisor/conf.d/frnd-ai-prod-service.conf"
  programs: SupervisorConfig[];
}

export function detectSupervisorPaths(): { 
  configPaths: string[]; 
  logPaths: string[];
  configFiles: DetectedConfigFile[];
} {
  const foundConfigPaths: string[] = [];
  const foundLogPaths: string[] = [];
  const configFiles: DetectedConfigFile[] = [];

  for (const configPath of SUPERVISOR_CONFIG_PATHS) {
    if (fs.existsSync(configPath)) {
      foundConfigPaths.push(configPath);
      
      // If it's a directory (like conf.d), list all .conf files
      const stat = fs.statSync(configPath);
      if (stat.isDirectory()) {
        const files = fs.readdirSync(configPath);
        for (const file of files) {
          if (file.endsWith('.conf') || file.endsWith('.ini')) {
            const filePath = path.join(configPath, file);
            const name = file.replace(/\.(conf|ini)$/, '');
            const programs = parseSingleConfigFile(filePath);
            configFiles.push({
              name,
              filename: file,
              path: filePath,
              programs,
            });
          }
        }
      }
    }
  }

  for (const logPath of SUPERVISOR_LOG_PATHS) {
    if (fs.existsSync(logPath)) {
      foundLogPaths.push(logPath);
    }
  }

  return { configPaths: foundConfigPaths, logPaths: foundLogPaths, configFiles };
}

export function parseSupervisorConfig(configPath: string): SupervisorConfig[] {
  const programs: SupervisorConfig[] = [];

  if (!fs.existsSync(configPath)) {
    return programs;
  }

  const stat = fs.statSync(configPath);

  if (stat.isDirectory()) {
    const files = fs.readdirSync(configPath);
    for (const file of files) {
      if (file.endsWith('.conf') || file.endsWith('.ini')) {
        const filePath = path.join(configPath, file);
        programs.push(...parseSingleConfigFile(filePath));
      }
    }
  } else {
    programs.push(...parseSingleConfigFile(configPath));
  }

  return programs;
}

function parseSingleConfigFile(filePath: string): SupervisorConfig[] {
  const programs: SupervisorConfig[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let currentProgram: SupervisorConfig | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith(';') || trimmedLine.startsWith('#') || !trimmedLine) {
        continue;
      }

      const sectionMatch = trimmedLine.match(/^\[program:(.+)\]$/);
      if (sectionMatch) {
        if (currentProgram) {
          programs.push(currentProgram);
        }
        currentProgram = { name: sectionMatch[1], command: '' };
        continue;
      }

      if (currentProgram) {
        const kvMatch = trimmedLine.match(/^(\w+)\s*=\s*(.+)$/);
        if (kvMatch) {
          const [, key, value] = kvMatch;
          switch (key) {
            case 'command':
              currentProgram.command = value;
              break;
            case 'directory':
              currentProgram.directory = value;
              break;
            case 'autostart':
              currentProgram.autostart = value === 'true';
              break;
            case 'autorestart':
              currentProgram.autorestart = value === 'true';
              break;
            case 'stdout_logfile':
              currentProgram.stdout_logfile = value;
              break;
            case 'stderr_logfile':
              currentProgram.stderr_logfile = value;
              break;
            case 'numprocs':
              currentProgram.numprocs = parseInt(value, 10);
              break;
            case 'process_name':
              currentProgram.process_name = value;
              break;
          }
        }
      }
    }

    if (currentProgram) {
      programs.push(currentProgram);
    }
  } catch (error) {
    console.error(`Error parsing config file ${filePath}:`, error);
  }

  return programs;
}

export function getLogFiles(logPath: string): string[] {
  const logFiles: string[] = [];

  if (!fs.existsSync(logPath)) {
    return logFiles;
  }

  const stat = fs.statSync(logPath);

  if (stat.isDirectory()) {
    const files = fs.readdirSync(logPath);
    for (const file of files) {
      if (file.endsWith('.log') || file.endsWith('.out') || file.endsWith('.err')) {
        logFiles.push(path.join(logPath, file));
      }
    }
  } else if (stat.isFile()) {
    logFiles.push(logPath);
  }

  return logFiles;
}

export interface LogEntry {
  timestamp: string | null;
  level: 'error' | 'warning' | 'info' | 'debug';
  message: string;
  lineNumber: number;
  raw: string;
}

export type LogTemplate = 'default' | 'laravel' | 'fastapi';

/**
 * Log template parsers for different frameworks
 */
const logParsers: Record<LogTemplate, (line: string, lineNumber: number) => LogEntry> = {
  /**
   * Default parser - generic format
   * Example: 2024-12-10 08:00:01,234 INFO [webapp] Application starting up...
   */
  default: (line: string, lineNumber: number): LogEntry => {
    const entry: LogEntry = {
      timestamp: null,
      level: 'info',
      message: line,
      lineNumber,
      raw: line,
    };

    const timestampPatterns = [
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)/,
      /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)/,
      /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d+)/,
      /^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/i,
    ];

    for (const pattern of timestampPatterns) {
      const match = line.match(pattern);
      if (match) {
        entry.timestamp = match[1];
        entry.message = line.slice(match[0].length).trim();
        break;
      }
    }

    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('exception') || lowerLine.includes('fatal') || lowerLine.includes('critical')) {
      entry.level = 'error';
    } else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
      entry.level = 'warning';
    } else if (lowerLine.includes('debug') || lowerLine.includes('trace')) {
      entry.level = 'debug';
    }

    return entry;
  },

  /**
   * Laravel parser
   * Example: [2024-12-10 08:00:01] production.ERROR: Something went wrong {"exception":"..."} 
   * Example: [2024-12-10 14:30:45] local.INFO: User logged in {"user_id":123}
   */
  laravel: (line: string, lineNumber: number): LogEntry => {
    const entry: LogEntry = {
      timestamp: null,
      level: 'info',
      message: line,
      lineNumber,
      raw: line,
    };

    // Laravel format: [YYYY-MM-DD HH:MM:SS] environment.LEVEL: message {context}
    const laravelPattern = /^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]\s+\w+\.(\w+):\s*(.*)$/;
    const match = line.match(laravelPattern);

    if (match) {
      entry.timestamp = match[1];
      const levelStr = match[2].toLowerCase();
      entry.message = match[3];

      // Map Laravel levels
      switch (levelStr) {
        case 'emergency':
        case 'alert':
        case 'critical':
        case 'error':
          entry.level = 'error';
          break;
        case 'warning':
          entry.level = 'warning';
          break;
        case 'notice':
        case 'info':
          entry.level = 'info';
          break;
        case 'debug':
          entry.level = 'debug';
          break;
        default:
          entry.level = 'info';
      }
    } else {
      // Fallback: might be a stack trace continuation
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('exception') || lowerLine.includes('error') || lowerLine.includes('fatal')) {
        entry.level = 'error';
      } else if (lowerLine.includes('#') && /^\s*#\d+/.test(line)) {
        // Stack trace line
        entry.level = 'error';
      }
    }

    return entry;
  },

  /**
   * FastAPI/Uvicorn parser
   * Example: INFO:     127.0.0.1:52340 - "GET /api/health HTTP/1.1" 200 OK
   * Example: 2024-12-10 08:00:01,234 - uvicorn.error - INFO - Application startup complete.
   * Example: ERROR:    Exception in ASGI application
   */
  fastapi: (line: string, lineNumber: number): LogEntry => {
    const entry: LogEntry = {
      timestamp: null,
      level: 'info',
      message: line,
      lineNumber,
      raw: line,
    };

    // Uvicorn simple format: LEVEL:     message
    const uvicornSimple = /^(INFO|WARNING|ERROR|DEBUG|CRITICAL):\s+(.*)$/i;
    const uvicornMatch = line.match(uvicornSimple);

    if (uvicornMatch) {
      const levelStr = uvicornMatch[1].toLowerCase();
      entry.message = uvicornMatch[2];

      switch (levelStr) {
        case 'error':
        case 'critical':
          entry.level = 'error';
          break;
        case 'warning':
          entry.level = 'warning';
          break;
        case 'debug':
          entry.level = 'debug';
          break;
        default:
          entry.level = 'info';
      }
      return entry;
    }

    // Python logging format: YYYY-MM-DD HH:MM:SS,mmm - logger - LEVEL - message
    const pythonLogging = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d+)\s+-\s+[\w.]+\s+-\s+(INFO|WARNING|ERROR|DEBUG|CRITICAL)\s+-\s+(.*)$/i;
    const pythonMatch = line.match(pythonLogging);

    if (pythonMatch) {
      entry.timestamp = pythonMatch[1];
      const levelStr = pythonMatch[2].toLowerCase();
      entry.message = pythonMatch[3];

      switch (levelStr) {
        case 'error':
        case 'critical':
          entry.level = 'error';
          break;
        case 'warning':
          entry.level = 'warning';
          break;
        case 'debug':
          entry.level = 'debug';
          break;
        default:
          entry.level = 'info';
      }
      return entry;
    }

    // JSON log format (common in FastAPI with structlog)
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const json = JSON.parse(line);
        entry.timestamp = json.timestamp || json.time || json.asctime || null;
        entry.message = json.message || json.msg || json.event || line;
        const levelStr = (json.level || json.levelname || 'info').toLowerCase();
        
        switch (levelStr) {
          case 'error':
          case 'critical':
          case 'fatal':
            entry.level = 'error';
            break;
          case 'warning':
          case 'warn':
            entry.level = 'warning';
            break;
          case 'debug':
            entry.level = 'debug';
            break;
          default:
            entry.level = 'info';
        }
        return entry;
      } catch {
        // Not valid JSON, continue with fallback
      }
    }

    // Fallback: detect level from content
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('exception') || lowerLine.includes('traceback')) {
      entry.level = 'error';
    } else if (lowerLine.includes('warning')) {
      entry.level = 'warning';
    } else if (lowerLine.includes('debug')) {
      entry.level = 'debug';
    }

    return entry;
  },
};

export function parseLogLine(line: string, lineNumber: number, template: LogTemplate = 'default'): LogEntry {
  const parser = logParsers[template] || logParsers.default;
  return parser(line, lineNumber);
}

export interface ReadLogOptions {
  startLine?: number;
  maxLines?: number;
  search?: string;
  level?: 'error' | 'warning' | 'info' | 'debug' | 'all';
  startDate?: Date;
  endDate?: Date;
  template?: LogTemplate;
}

export function readLogFile(filePath: string, options: ReadLogOptions = {}): { entries: LogEntry[]; totalLines: number; hasMore: boolean } {
  const {
    startLine = 0,
    maxLines = 500,
    search,
    level = 'all',
    startDate,
    endDate,
    template = 'default',
  } = options;

  const entries: LogEntry[] = [];

  if (!fs.existsSync(filePath)) {
    return { entries, totalLines: 0, hasMore: false };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    let processedCount = 0;

    for (let i = startLine; i < lines.length && processedCount < maxLines; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const entry = parseLogLine(line, i + 1, template);

      if (level !== 'all' && entry.level !== level) continue;
      if (search && !line.toLowerCase().includes(search.toLowerCase())) continue;

      if (entry.timestamp) {
        const entryDate = new Date(entry.timestamp);
        if (startDate && entryDate < startDate) continue;
        if (endDate && entryDate > endDate) continue;
      }

      entries.push(entry);
      processedCount++;
    }

    return {
      entries,
      totalLines,
      hasMore: startLine + processedCount < totalLines,
    };
  } catch (error) {
    console.error(`Error reading log file ${filePath}:`, error);
    return { entries: [], totalLines: 0, hasMore: false };
  }
}

export function tailLogFile(filePath: string, lines: number = 100, template: LogTemplate = 'default'): LogEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n').filter(l => l.trim());
    const startIndex = Math.max(0, allLines.length - lines);

    return allLines.slice(startIndex).map((line, index) => parseLogLine(line, startIndex + index + 1, template));
  } catch {
    return [];
  }
}

export interface NewLogsResult {
  newCount: number;
  totalLines: number;
  entries?: LogEntry[];
}

export function checkNewLogs(filePath: string, lastLineNumber: number, fetchEntries = false, template: LogTemplate = 'default'): NewLogsResult {
  if (!fs.existsSync(filePath)) {
    return { newCount: 0, totalLines: 0 };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');
    const nonEmptyLines = allLines.filter(l => l.trim());
    const totalLines = nonEmptyLines.length;
    const newCount = Math.max(0, totalLines - lastLineNumber);

    if (!fetchEntries || newCount === 0) {
      return { newCount, totalLines };
    }

    // Fetch the new entries
    const entries: LogEntry[] = [];
    let lineIndex = 0;
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      if (!line.trim()) continue;
      lineIndex++;
      if (lineIndex > lastLineNumber) {
        entries.push(parseLogLine(line, lineIndex, template));
      }
    }

    return { newCount, totalLines, entries };
  } catch {
    return { newCount: 0, totalLines: 0 };
  }
}

export interface ReadLogFromEndOptions {
  limit?: number;
  beforeLine?: number; // Load lines before this line number (for pagination)
  search?: string;
  level?: 'error' | 'warning' | 'info' | 'debug' | 'all';
  startDate?: Date;
  endDate?: Date;
  template?: LogTemplate;
}

export interface ReadLogFromEndResult {
  entries: LogEntry[];
  totalLines: number;
  hasMore: boolean;
  oldestLineLoaded: number;
  newestLineLoaded: number;
}

/**
 * Read log file from the end (most recent logs first)
 * Efficiently loads only the last N lines
 */
export function readLogFileFromEnd(filePath: string, options: ReadLogFromEndOptions = {}): ReadLogFromEndResult {
  const {
    limit = 500,
    beforeLine,
    search,
    level = 'all',
    startDate,
    endDate,
    template = 'default',
  } = options;

  if (!fs.existsSync(filePath)) {
    return { entries: [], totalLines: 0, hasMore: false, oldestLineLoaded: 0, newestLineLoaded: 0 };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');
    
    // Build array of non-empty lines with their original line numbers
    const indexedLines: { line: string; lineNumber: number }[] = [];
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      if (line.trim()) {
        indexedLines.push({ line, lineNumber: i + 1 });
      }
    }
    
    const totalLines = indexedLines.length;
    
    if (totalLines === 0) {
      return { entries: [], totalLines: 0, hasMore: false, oldestLineLoaded: 0, newestLineLoaded: 0 };
    }

    // Determine the end index for loading
    let endIndex = indexedLines.length;
    if (beforeLine !== undefined) {
      // Find the index of the line just before beforeLine
      endIndex = indexedLines.findIndex(l => l.lineNumber >= beforeLine);
      if (endIndex === -1) endIndex = indexedLines.length;
    }

    // Collect entries from the end, going backwards
    const entries: LogEntry[] = [];
    let oldestLineLoaded = 0;
    let newestLineLoaded = 0;

    for (let i = endIndex - 1; i >= 0 && entries.length < limit; i--) {
      const { line, lineNumber } = indexedLines[i];
      const entry = parseLogLine(line, lineNumber, template);

      // Apply filters
      if (level !== 'all' && entry.level !== level) continue;
      if (search && !line.toLowerCase().includes(search.toLowerCase())) continue;

      if (entry.timestamp) {
        const entryDate = new Date(entry.timestamp);
        if (startDate && entryDate < startDate) continue;
        if (endDate && entryDate > endDate) continue;
      }

      entries.push(entry);
      
      if (newestLineLoaded === 0) newestLineLoaded = lineNumber;
      oldestLineLoaded = lineNumber;
    }

    // Reverse to get chronological order (oldest first in the array)
    entries.reverse();

    const hasMore = oldestLineLoaded > 1 && indexedLines[0].lineNumber < oldestLineLoaded;

    return {
      entries,
      totalLines,
      hasMore,
      oldestLineLoaded,
      newestLineLoaded,
    };
  } catch (error) {
    console.error(`Error reading log file ${filePath}:`, error);
    return { entries: [], totalLines: 0, hasMore: false, oldestLineLoaded: 0, newestLineLoaded: 0 };
  }
}
