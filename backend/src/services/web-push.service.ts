import crypto from 'crypto';
import https from 'https';
import { URL } from 'url';
import { prisma } from '../utils/prisma';

type WebPushPayload = {
  title: string;
  body?: string | null;
  linkUrl?: string | null;
};

type PushSubscriptionInput = {
  userId: string;
  endpoint: string;
  keys: {
    p256dh?: string;
    auth?: string;
  };
  userAgent?: string | null;
};

const base64UrlToBuffer = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
};

const bufferToBase64Url = (value: Buffer | string) => {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

class WebPushService {
  getPublicKey() {
    return process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
  }

  private getPrivateKey() {
    return process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';
  }

  private getSubject() {
    return process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:admin@bakircilarkampanya.com';
  }

  private buildVapidJwt(audience: string) {
    const publicKey = this.getPublicKey();
    const privateKey = this.getPrivateKey();
    if (!publicKey || !privateKey) return null;

    const rawPublic = base64UrlToBuffer(publicKey);
    if (rawPublic.length !== 65 || rawPublic[0] !== 4) {
      throw new Error('Invalid WEB_PUSH_VAPID_PUBLIC_KEY');
    }

    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: bufferToBase64Url(rawPublic.subarray(1, 33)),
      y: bufferToBase64Url(rawPublic.subarray(33, 65)),
      d: privateKey,
    };

    const header = bufferToBase64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const payload = bufferToBase64Url(JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: this.getSubject(),
    }));
    const unsigned = `${header}.${payload}`;
    const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
    const signature = crypto.sign('sha256', Buffer.from(unsigned), {
      key,
      dsaEncoding: 'ieee-p1363',
    });

    return `${unsigned}.${bufferToBase64Url(signature)}`;
  }

  async registerSubscription(input: PushSubscriptionInput) {
    const endpoint = String(input.endpoint || '').trim();
    const p256dh = String(input.keys?.p256dh || '').trim();
    const auth = String(input.keys?.auth || '').trim();
    if (!endpoint || !p256dh || !auth) {
      throw new Error('Eksik web push subscription');
    }

    await prisma.webPushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: input.userId,
        endpoint,
        p256dh,
        auth,
        userAgent: input.userAgent || null,
        active: true,
      },
      update: {
        userId: input.userId,
        p256dh,
        auth,
        userAgent: input.userAgent || null,
        active: true,
      },
    });
  }

  async unregisterSubscription(input: { userId: string; endpoint: string }) {
    const endpoint = String(input.endpoint || '').trim();
    if (!endpoint) return;

    await prisma.webPushSubscription.updateMany({
      where: { userId: input.userId, endpoint },
      data: { active: false },
    });
  }

  private async postWakeup(endpoint: string) {
    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const jwt = this.buildVapidJwt(audience);
    const publicKey = this.getPublicKey();
    if (!jwt || !publicKey) return { skipped: true, statusCode: 0 };

    return new Promise<{ skipped: boolean; statusCode: number }>((resolve, reject) => {
      const req = https.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: {
            TTL: '300',
            Urgency: 'high',
            Authorization: `vapid t=${jwt}, k=${publicKey}`,
            'Content-Length': '0',
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ skipped: false, statusCode: res.statusCode || 0 }));
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  async sendToUsers(userIds: string[], _payload: WebPushPayload) {
    const uniqueUserIds = Array.from(new Set((userIds || []).filter(Boolean)));
    if (uniqueUserIds.length === 0) return;
    if (!this.getPublicKey() || !this.getPrivateKey()) return;

    const rows = await prisma.webPushSubscription.findMany({
      where: {
        userId: { in: uniqueUserIds },
        active: true,
      },
      select: { id: true, endpoint: true },
    });

    for (const row of rows) {
      try {
        const result = await this.postWakeup(row.endpoint);
        if ([404, 410].includes(result.statusCode)) {
          await prisma.webPushSubscription.update({
            where: { id: row.id },
            data: { active: false },
          });
        }
      } catch (error) {
        console.error('Web push send failed', { subscriptionId: row.id, error });
      }
    }
  }
}

export default new WebPushService();
