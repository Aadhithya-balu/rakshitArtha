const logger = require('../utils/logger');
const { sendPushToTokens } = require('../services/pushService');
const notifications = [];

const getLogs = (req, res) => {
  const currentLogs = logger.getLogs();
  res.status(200).json(currentLogs);
};

const getNotifications = (req, res) => {
  const userIdFilter = req.query.userId ? String(req.query.userId) : null;
  const filtered = userIdFilter
    ? notifications.filter((item) => String(item.userId) === userIdFilter)
    : notifications;

  res.status(200).json({
    success: true,
    data: filtered.slice(0, 50)
  });
};

function buildNotificationRecord(payload) {
  const details = payload?.data || {};
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: payload.userId,
    type: payload.type,
    title: details.title || payload.message,
    message: payload.message,
    severity: String(details.severity || 'info').toUpperCase(),
    zone: details.zone || details.location || 'Your Zone',
    data: details,
    delivered: true,
    deliveredAt: new Date().toISOString()
  };
}

const sendNotification = (req, res) => {
  const { userId, type, message, data, deviceTokens } = req.body || {};

  if (!userId || !type || !message) {
    return res.status(400).json({
      success: false,
      message: 'userId, type, and message are required'
    });
  }

  logger.log(
    `Notification accepted: userId=${userId}, type=${type}, message=${message}, data=${JSON.stringify(data || {})}`
  );

  const record = buildNotificationRecord({ userId, type, message, data });

  const complete = async () => {
    const pushResult = await sendPushToTokens(deviceTokens || [], {
      title: record.title,
      body: record.message,
      data: {
        type: record.type,
        userId: String(record.userId),
        zone: record.zone,
        severity: record.severity,
        deliveredAt: record.deliveredAt
      }
    });

    const enriched = {
      ...record,
      push: pushResult
    };

    notifications.unshift(enriched);
    if (notifications.length > 50) {
      notifications.pop();
    }

    return res.status(200).json({
      success: true,
      message: 'Notification accepted',
      data: enriched
    });
  };

  complete().catch((error) => {
    logger.log(`Notification dispatch failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Notification dispatch failed' });
  });
};

module.exports = { getLogs, getNotifications, sendNotification };
