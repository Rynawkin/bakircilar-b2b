const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const arrayBufferToBase64Url = (buffer: ArrayBuffer | null | undefined) => {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

export type BrowserPushResult = {
  enabled: boolean;
  reason?: string;
};

export const browserPushReasonLabel = (reason?: string) => {
  if (reason === 'unsupported') return 'Bu tarayici web bildirimlerini desteklemiyor.';
  if (reason === 'missing-key') return 'Bildirim anahtari bulunamadi. Sistem ayarlari kontrol edilmeli.';
  if (reason === 'denied') return 'Tarayici bildirim izni engellenmis. Site izinlerinden tekrar acilmali.';
  if (reason === 'default') return 'Bildirim izni verilmedi.';
  if (reason === 'server') return 'Bildirimler sadece tarayicida acilabilir.';
  return 'Tarayici bildirimi acilamadi.';
};

export async function registerBrowserPush(options: {
  getPublicKey: () => Promise<string | null | undefined>;
  registerSubscription: (subscription: PushSubscriptionJSON) => Promise<unknown>;
}): Promise<BrowserPushResult> {
  if (typeof window === 'undefined') return { enabled: false, reason: 'server' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { enabled: false, reason: 'unsupported' };
  }

  const publicKey = await options.getPublicKey();
  if (!publicKey) return { enabled: false, reason: 'missing-key' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { enabled: false, reason: permission };

  const existingRegistration = await navigator.serviceWorker.getRegistration('/');
  const registration = existingRegistration || (await navigator.serviceWorker.register('/web-push-sw.js', { scope: '/' }));
  const readyRegistration = await navigator.serviceWorker.ready;
  const pushRegistration = readyRegistration || registration;

  const expectedKey = publicKey.replace(/=+$/g, '');
  let existing = await pushRegistration.pushManager.getSubscription();
  const existingKey = arrayBufferToBase64Url(existing?.options?.applicationServerKey as ArrayBuffer | null | undefined);
  if (existing && existingKey && existingKey !== expectedKey) {
    await existing.unsubscribe();
    existing = null;
  }

  const subscription =
    existing ||
    (await pushRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await options.registerSubscription(subscription.toJSON());
  return { enabled: true };
}
