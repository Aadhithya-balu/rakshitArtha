const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const logger = require('../utils/logger');

let initialized = false;

function parseServiceAccount() {
  const jsonBlob = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonBlob) {
    try {
      return JSON.parse(jsonBlob);
    } catch (error) {
      logger.log(`Firebase service account JSON parse failed: ${error.message}`);
    }
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    try {
      const resolved = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.join(process.cwd(), serviceAccountPath);
      const raw = fs.readFileSync(resolved, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      logger.log(`Firebase service account file read failed: ${error.message}`);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n')
    };
  }

  return null;
}

function ensureFirebase() {
  if (initialized) return true;
  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    logger.log('Firebase Admin not configured. Push delivery skipped.');
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    initialized = true;
    logger.log('Firebase Admin initialized for push delivery.');
    return true;
  } catch (error) {
    logger.log(`Firebase Admin initialization failed: ${error.message}`);
    return false;
  }
}

async function sendPushToTokens(tokens = [], { title, body, data = {} } = {}) {
  const validTokens = [...new Set(tokens.filter((token) => typeof token === 'string' && token.trim().length > 0))];
  if (!validTokens.length) {
    return { sent: 0, failed: 0, invalidTokens: [], skipped: true, reason: 'No device tokens provided' };
  }

  if (!ensureFirebase()) {
    return { sent: 0, failed: validTokens.length, invalidTokens: [], skipped: true, reason: 'Firebase not configured' };
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: validTokens,
      notification: {
        title: title || 'RakshitArtha Alert',
        body: body || 'A new update is available.'
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'rakshitartha_notifications',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: title || 'RakshitArtha Alert',
              body: body || 'A new update is available.',
            },
            sound: 'default',
            badge: 1,
            'content-available': 1,
          }
        },
        headers: {
          'apns-priority': '10',
          'apns-expedited-priority-enabled': 'true'
        }
      },
      webpush: {
        notification: {
          title: title || 'RakshitArtha Alert',
          body: body || 'A new update is available.',
          icon: 'https://via.placeholder.com/192'
        }
      },
      data: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value == null ? '' : String(value)])
      )
    });

    const invalidTokens = [];
    response.responses.forEach((item, index) => {
      if (!item.success) {
        const code = item.error?.code || '';
        if (code.includes('invalid-registration-token') || code.includes('registration-token-not-registered')) {
          invalidTokens.push(validTokens[index]);
        }
      }
    });

    logger.log(`Push notification sent: ${response.successCount} succeeded, ${response.failureCount} failed, ${invalidTokens.length} invalid tokens`);

    return {
      sent: response.successCount,
      failed: response.failureCount,
      invalidTokens,
      skipped: false,
      reason: null
    };
  } catch (error) {
    logger.log(`Firebase push send failed: ${error.message}`);
    return {
      sent: 0,
      failed: validTokens.length,
      invalidTokens: [],
      skipped: false,
      reason: error.message
    };
  }
}

module.exports = {
  sendPushToTokens
};
