import { Request } from 'express';

// X-Real-IP is trustworthy only when the request came through local nginx.
// Direct callers of port 5000 can forge forwarding headers, so use the socket.
export const getTrustedClientIp = (req: Request): string => {
  const socketIp = req.socket.remoteAddress || '';
  const viaLocalProxy = socketIp === '127.0.0.1'
    || socketIp === '::1'
    || socketIp === '::ffff:127.0.0.1';
  if (viaLocalProxy) return String(req.headers['x-real-ip'] || req.ip || 'unknown');
  return socketIp || 'unknown';
};
