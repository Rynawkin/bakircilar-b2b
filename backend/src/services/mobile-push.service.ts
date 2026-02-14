import https from 'https';
import { prisma } from '../utils/prisma';

type PushPayload = {
  title: string;
  body?: string | null;
  linkUrl?: string | null;
};

type PushTokenRow = {
  token: string;
  user_id: string;
};

type ExpoPushResult = {
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
  };
};

class MobilePushService {
  private readyPromise: Promise<void> | null = null;

  private async ensureTable() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS mobile_push_tokens (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          platform TEXT,
          app_name TEXT,
          device_name TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user_id ON mobile_push_tokens(user_id);'
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_active ON mobile_push_tokens(active);'
      );
    })().catch((error) => {
      this.readyPromise = null;
      throw error;
    });

    return this.readyPromise;
  }

  private async postExpo(messages: Array<Record<string, unknown>>) {
    const body = JSON.stringify(messages);

    const responseText = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'exp.host',
          path: '/--/api/v2/push/send',
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve(data);
          });
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });

    try {
      const parsed = JSON.parse(responseText);
      return Array.isArray(parsed?.data) ? (parsed.data as ExpoPushResult[]) : [];
    } catch {
      return [];
    }
  }

  private async deactivateToken(token: string) {
    try {
      await prisma.$executeRawUnsafe(
        'UPDATE mobile_push_tokens SET active = FALSE, last_seen_at = NOW() WHERE token = $1',
        token
      );
    } catch (error) {
      console.error('Push token deactivate failed', { token, error });
    }
  }

  async registerToken(input: {
    userId: string;
    token: string;
    platform?: string | null;
    appName?: string | null;
    deviceName?: string | null;
  }) {
    await this.ensureTable();

    const token = String(input.token || '').trim();
    if (!token) {
      throw new Error('Push token is required');
    }

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO mobile_push_tokens (token, user_id, platform, app_name, device_name, active, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
      ON CONFLICT (token)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        app_name = EXCLUDED.app_name,
        device_name = EXCLUDED.device_name,
        active = TRUE,
        last_seen_at = NOW()
      `,
      token,
      input.userId,
      input.platform || null,
      input.appName || null,
      input.deviceName || null
    );
  }

  async unregisterToken(input: {
    userId: string;
    token: string;
  }) {
    await this.ensureTable();

    const token = String(input.token || '').trim();
    if (!token) return;

    await prisma.$executeRawUnsafe(
      `
      UPDATE mobile_push_tokens
      SET active = FALSE, last_seen_at = NOW()
      WHERE token = $1 AND user_id = $2
      `,
      token,
      input.userId
    );
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    if (!payload?.title) return;

    await this.ensureTable();

    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) return;

    const placeholders = uniqueUserIds.map((_, index) => `$${index + 1}`).join(', ');
    const rows = await prisma.$queryRawUnsafe<PushTokenRow[]>(
      `
      SELECT token, user_id
      FROM mobile_push_tokens
      WHERE active = TRUE
        AND user_id IN (${placeholders})
      `,
      ...uniqueUserIds
    );

    if (!rows || rows.length === 0) return;

    const tokens = rows
      .map((row) => row.token)
      .filter((token) => typeof token === 'string' && token.trim().length > 0);

    if (tokens.length === 0) return;

    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title: payload.title,
      body: payload.body || '',
      data: {
        linkUrl: payload.linkUrl || null,
      },
    }));

    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const results = await this.postExpo(chunk);
        for (let idx = 0; idx < results.length; idx += 1) {
          const result = results[idx];
          if (result?.status === 'error' && result?.details?.error === 'DeviceNotRegistered') {
            const token = String(chunk[idx]?.to || '');
            if (token) {
              await this.deactivateToken(token);
            }
          }
        }
      } catch (error) {
        console.error('Expo push send failed', { error });
      }
    }
  }
}

export default new MobilePushService();
