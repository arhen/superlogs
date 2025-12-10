import { createServerFn } from '@tanstack/react-start';
import { db, projectQueries, supervisorQueries, configQueries } from './db';
import { authMiddleware } from './auth';
import {
  detectSupervisorPaths,
  parseSupervisorConfig,
  readLogFile,
  tailLogFile,
  checkNewLogs,
  getLogFiles,
  type ReadLogOptions,
} from './supervisor';
import { z } from 'zod';

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  environment: z.enum(['local', 'development', 'staging', 'production']),
});

const updateProjectSchema = createProjectSchema.extend({
  id: z.number(),
});

const createSupervisorSchema = z.object({
  projectId: z.number(),
  name: z.string().min(1),
  configPath: z.string().min(1),
  logPath: z.string().min(1),
  errorLogPath: z.string().optional(),
});

const updateSupervisorSchema = createSupervisorSchema.extend({
  id: z.number(),
});

const logQuerySchema = z.object({
  supervisorId: z.number(),
  logType: z.enum(['stdout', 'stderr']).default('stdout'),
  startLine: z.number().default(0),
  maxLines: z.number().default(500),
  search: z.string().optional(),
  level: z.enum(['error', 'warning', 'info', 'debug', 'all']).default('all'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const getProjects = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const projects = projectQueries.getAll.all();
    return { projects };
  });

export const getProject = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const project = projectQueries.getById.get(data.id);
    if (!project) {
      throw new Error('Project not found');
    }
    const supervisors = supervisorQueries.getByProjectId.all(data.id);
    return { project, supervisors };
  });

export const createProject = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: z.infer<typeof createProjectSchema>) => createProjectSchema.parse(data))
  .handler(async ({ data }) => {
    projectQueries.create.run(data.name, data.description || null, data.environment);
    const lastId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    const project = projectQueries.getById.get(lastId);
    return { project };
  });

export const updateProject = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: z.infer<typeof updateProjectSchema>) => updateProjectSchema.parse(data))
  .handler(async ({ data }) => {
    projectQueries.update.run(data.name, data.description || null, data.environment, data.id);
    const project = projectQueries.getById.get(data.id);
    return { project };
  });

export const deleteProject = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    projectQueries.delete.run(data.id);
    return { success: true };
  });

export const getSupervisors = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: { projectId: number }) => data)
  .handler(async ({ data }) => {
    const supervisors = supervisorQueries.getByProjectId.all(data.projectId);
    return { supervisors };
  });

export const getSupervisor = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const supervisor = supervisorQueries.getById.get(data.id);
    if (!supervisor) {
      throw new Error('Supervisor not found');
    }
    
    // Parse the config file to get program info
    let configInfo = null;
    if (supervisor.config_path) {
      const programs = parseSupervisorConfig(supervisor.config_path);
      if (programs.length > 0) {
        // Find the program that matches the log path, or use the first one
        const matchingProgram = programs.find(
          p => p.stdout_logfile === supervisor.log_path || p.stderr_logfile === supervisor.error_log_path
        ) || programs[0];
        
        configInfo = {
          programName: matchingProgram.name,
          command: matchingProgram.command,
          directory: matchingProgram.directory,
          autostart: matchingProgram.autostart,
          autorestart: matchingProgram.autorestart,
          numprocs: matchingProgram.numprocs,
          stdoutLogfile: matchingProgram.stdout_logfile,
          stderrLogfile: matchingProgram.stderr_logfile,
        };
      }
    }
    
    return { supervisor, configInfo };
  });

export const createSupervisor = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: z.infer<typeof createSupervisorSchema>) => createSupervisorSchema.parse(data))
  .handler(async ({ data }) => {
    supervisorQueries.create.run(
      data.projectId,
      data.name,
      data.configPath,
      data.logPath,
      data.errorLogPath || null
    );
    const lastId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    const supervisor = supervisorQueries.getById.get(lastId);
    return { supervisor };
  });

export const updateSupervisor = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: z.infer<typeof updateSupervisorSchema>) => updateSupervisorSchema.parse(data))
  .handler(async ({ data }) => {
    supervisorQueries.update.run(data.name, data.configPath, data.logPath, data.errorLogPath || null, data.id);
    const supervisor = supervisorQueries.getById.get(data.id);
    return { supervisor };
  });

export const deleteSupervisor = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    supervisorQueries.delete.run(data.id);
    return { success: true };
  });

export const getLogs = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: z.infer<typeof logQuerySchema>) => logQuerySchema.parse(data))
  .handler(async ({ data }) => {
    const supervisor = supervisorQueries.getById.get(data.supervisorId);
    if (!supervisor) {
      throw new Error('Supervisor not found');
    }

    const logPath = data.logType === 'stderr' ? supervisor.error_log_path : supervisor.log_path;
    if (!logPath) {
      return { entries: [], totalLines: 0, hasMore: false };
    }

    const options: ReadLogOptions = {
      startLine: data.startLine,
      maxLines: data.maxLines,
      search: data.search,
      level: data.level,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    };

    return readLogFile(logPath, options);
  });

export const getTailLogs = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: { supervisorId: number; logType?: 'stdout' | 'stderr'; lines?: number }) => data)
  .handler(async ({ data }) => {
    const supervisor = supervisorQueries.getById.get(data.supervisorId);
    if (!supervisor) {
      throw new Error('Supervisor not found');
    }

    const logPath = data.logType === 'stderr' ? supervisor.error_log_path : supervisor.log_path;
    if (!logPath) {
      return { entries: [] };
    }

    const entries = tailLogFile(logPath, data.lines || 100);
    return { entries };
  });

export const checkForNewLogs = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: { supervisorId: number; lastLineNumber: number; logType?: 'stdout' | 'stderr'; fetchEntries?: boolean }) => data)
  .handler(async ({ data }) => {
    const supervisor = supervisorQueries.getById.get(data.supervisorId);
    if (!supervisor) {
      throw new Error('Supervisor not found');
    }

    const logPath = data.logType === 'stderr' ? supervisor.error_log_path : supervisor.log_path;
    if (!logPath) {
      return { newCount: 0, totalLines: 0 };
    }

    return checkNewLogs(logPath, data.lastLineNumber, data.fetchEntries ?? false);
  });

export const detectSupervisor = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const { configPaths, logPaths, configFiles } = detectSupervisorPaths();

    const detectedLogFiles: string[] = [];
    for (const logPath of logPaths) {
      detectedLogFiles.push(...getLogFiles(logPath));
    }

    return {
      configPaths,
      logPaths,
      configFiles,
      detectedLogFiles,
    };
  });

export const getConfig = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const config = configQueries.get.get(data.key);
    return { value: config?.value || null };
  });

export const setConfig = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { key: string; value: string }) => data)
  .handler(async ({ data }) => {
    configQueries.set.run(data.key, data.value);
    return { success: true };
  });

export const getProjectsWithSupervisors = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const projects = projectQueries.getAll.all();
    const result = projects.map((project: { id: number; name: string; description: string | null; environment: string; created_at: string }) => ({
      ...project,
      supervisors: supervisorQueries.getByProjectId.all(project.id),
    }));

    return { projects: result };
  });
