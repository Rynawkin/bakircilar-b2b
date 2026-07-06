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

export async function registerBrowserPush(options: {
  getPublicKey: () => Promise<string | null | undefined>;
  registerSubscription: (subscription: PushSubscriptionJSON) => Promise<unknown>;
}) {
  if (typeof window === 'undefined') return { enabled: false, reason: 'server' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { enabled: false, reason: 'unsupported' };
  }

  const publicKey = await options.getPublicKey();
  if (!publicKey) return { enabled: false, reason: 'missing-key' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { enabled: false, reason: permission };

  const registration = await navigator.serviceWorker.register('/web-push-sw.js');
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await options.registerSubscription(subscription.toJSON());
  return { enabled: true };
}
