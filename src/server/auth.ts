import bcrypt from 'bcryptjs';
import { userQueries, sessionQueries } from './db';
import { createServerFn, createMiddleware } from '@tanstack/react-start';
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server';

const SESSION_COOKIE_NAME = 'supervisor_logs_session';
const SESSION_DURATION_DAYS = 7;

function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const login = createServerFn({ method: 'POST' })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { username, password } = data;

    const user = userQueries.getByUsername.get(username);
    if (!user) {
      return { success: false, error: 'Invalid username or password' };
    }

    const passwordValid = bcrypt.compareSync(password, user.password_hash);
    if (!passwordValid) {
      return { success: false, error: 'Invalid username or password' };
    }

    const sessionId = generateSessionId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    sessionQueries.create.run(sessionId, user.id, expiresAt.toISOString());

    setCookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
      path: '/',
    });

    sessionQueries.deleteExpired.run();

    return { success: true, user: { id: user.id, username: user.username } };
  });

export const logout = createServerFn({ method: 'POST' })
  .handler(async () => {
    const sessionId = await getCookie(SESSION_COOKIE_NAME);
    if (sessionId) {
      sessionQueries.delete.run(sessionId);
    }
    deleteCookie(SESSION_COOKIE_NAME);
    return { success: true };
  });

export const getCurrentUser = createServerFn({ method: 'GET' })
  .handler(async () => {
    const sessionId = await getCookie(SESSION_COOKIE_NAME);
    if (!sessionId) {
      return { user: null };
    }

    const session = sessionQueries.getValidById.get(sessionId);
    if (!session) {
      deleteCookie(SESSION_COOKIE_NAME);
      return { user: null };
    }

    const user = userQueries.getById.get(session.user_id);
    if (!user) {
      sessionQueries.delete.run(sessionId);
      deleteCookie(SESSION_COOKIE_NAME);
      return { user: null };
    }

    return { user: { id: user.id, username: user.username } };
  });

export const changePassword = createServerFn({ method: 'POST' })
  .inputValidator((data: { currentPassword: string; newPassword: string }) => data)
  .handler(async ({ data }) => {
    const { currentPassword, newPassword } = data;

    const sessionId = await getCookie(SESSION_COOKIE_NAME);
    if (!sessionId) {
      return { success: false, error: 'Not authenticated' };
    }

    const session = sessionQueries.getValidById.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session expired' };
    }

    const user = userQueries.getById.get(session.user_id);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const passwordValid = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!passwordValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    const newPasswordHash = bcrypt.hashSync(newPassword, 10);
    userQueries.updatePassword.run(newPasswordHash, user.id);

    sessionQueries.deleteByUserId.run(user.id);

    const newSessionId = generateSessionId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    sessionQueries.create.run(newSessionId, user.id, expiresAt.toISOString());

    setCookie(SESSION_COOKIE_NAME, newSessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
      path: '/',
    });

    return { success: true };
  });

// Auth middleware - properly strips server-only code from client bundle
export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const sessionId = await getCookie(SESSION_COOKIE_NAME);
  if (!sessionId) {
    throw new Error('Not authenticated');
  }

  const session = sessionQueries.getValidById.get(sessionId);
  if (!session) {
    throw new Error('Session expired');
  }

  const user = userQueries.getById.get(session.user_id);
  if (!user) {
    throw new Error('User not found');
  }

  return next({ context: { user } });
});
