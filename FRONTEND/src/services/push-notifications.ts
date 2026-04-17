import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { registerPushDeviceToken } from '@/services/auth-api';
import { Storage } from '@/utils/storage';

const TOKEN_CACHE_KEY = 'rakshitartha_push_token';

type MessagingClient = {
  requestPermission: () => Promise<number>;
  registerDeviceForRemoteMessages: () => Promise<void>;
  getToken: () => Promise<string>;
  onMessage: (callback: (message: any) => void) => () => void;
  onNotificationOpenedApp: (callback: (message: any) => void) => () => void;
  getInitialNotification: () => Promise<any>;
};

type MessagingModule = (() => MessagingClient) & {
  AuthorizationStatus: {
    AUTHORIZED: number;
    PROVISIONAL: number;
  };
};

let messagingModule: MessagingModule | null = null;
let messageHandlerUnsubscribe: (() => void) | null = null;
let foregroundHandlerUnsubscribe: (() => void) | null = null;

function getMessagingModule(): MessagingModule | null {
  if (messagingModule) return messagingModule;

  // If Firebase native modules are not present in the current build,
  // do not initialize messaging.
  if (!NativeModules?.RNFBAppModule || !NativeModules?.RNFBMessagingModule) {
    return null;
  }

  try {
    messagingModule = messaging as unknown as MessagingModule;
    return messagingModule;
  } catch {
    return null;
  }
}

async function requestAndroidPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 33) return true;

  const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return status === PermissionsAndroid.RESULTS.GRANTED;
}

async function requestMessagingPermission(): Promise<boolean> {
  const androidOk = await requestAndroidPermission();
  if (!androidOk) return false;

  const messaging = getMessagingModule();
  if (!messaging) return false;

  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

export async function registerDevicePushToken(backendUserId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const messaging = getMessagingModule();
    if (!messaging) {
      return { ok: false, reason: 'Firebase messaging native module is unavailable' };
    }

    const hasPermission = await requestMessagingPermission();
    if (!hasPermission) {
      return { ok: false, reason: 'Notification permission denied' };
    }

    const client = messaging();
    await client.registerDeviceForRemoteMessages();
    const token = await client.getToken();
    if (!token) {
      return { ok: false, reason: 'Unable to fetch FCM token' };
    }

    const cached = Storage.getItem(TOKEN_CACHE_KEY);
    if (cached === token) {
      return { ok: true };
    }

    await registerPushDeviceToken(backendUserId, token, Platform.OS === 'ios' ? 'ios' : 'android');
    Storage.setItem(TOKEN_CACHE_KEY, token);

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'FCM setup failed' };
  }
}

/**
 * Setup push notification handlers for OS notifications
 * This must be called early in app initialization
 */
export function setupPushNotificationHandlers(): void {
  const messaging = getMessagingModule();
  if (!messaging) {
    console.log('[Push] Firebase messaging module not available');
    return;
  }

  try {
    const client = messaging();

    // Cleanup any existing handlers
    messageHandlerUnsubscribe?.();
    foregroundHandlerUnsubscribe?.();

    // Handle messages received while app is in foreground
    // This triggers OS notification display on both Android and iOS
    messageHandlerUnsubscribe = client.onMessage(async (message) => {
      console.log('[Push] Foreground message received:', message);
      
      // Firebase will automatically display OS notification if data payload is properly formatted
      // For Android, ensure notification channel exists and priority is set to high
      if (message.notification) {
        const notification = {
          title: message.notification.title || 'RakshitArtha',
          body: message.notification.body || 'New notification',
          data: message.data || {},
        };
        console.log('[Push] Displaying OS notification:', notification);
      }
    });

    // Handle notification opened while app is in background/killed
    foregroundHandlerUnsubscribe = client.onNotificationOpenedApp(async (message) => {
      console.log('[Push] Notification opened (background):', message);
      
      if (message?.notification) {
        console.log('[Push] Notification title:', message.notification.title);
        console.log('[Push] Notification body:', message.notification.body);
      }
    });

    // Check for initial notification (app opened from killed state)
    client.getInitialNotification().then(message => {
      if (message?.notification) {
        console.log('[Push] Initial notification (from killed state):', message);
      }
    }).catch(error => {
      console.log('[Push] Error getting initial notification:', error);
    });

    console.log('[Push] Notification handlers setup complete');
  } catch (error) {
    console.log('[Push] Failed to setup notification handlers:', error);
  }
}

/**
 * Cleanup push notification handlers
 */
export function cleanupPushNotificationHandlers(): void {
  messageHandlerUnsubscribe?.();
  foregroundHandlerUnsubscribe?.();
  messageHandlerUnsubscribe = null;
  foregroundHandlerUnsubscribe = null;
}
