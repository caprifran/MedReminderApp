import notifee, {
  AndroidImportance,
  AndroidCategory,
  TriggerType,
  TimestampTrigger,
} from '@notifee/react-native';

export class NotificationService {
  static CHANNEL_ID = 'medication-alarms-v6';

  static async initialize() {
    try {
      // 1. Request permissions (specifically for iOS and Android 13+)
      const settings = await notifee.requestPermission();
      console.log('[NotificationService] Permission settings:', settings.authorizationStatus);

      // 2. Create high importance notification channel for Android
      await notifee.createChannel({
        id: 'alarm-channel',
        name: 'Alarm Channel',
        importance: AndroidImportance.HIGH,
        bypassDnd: true,
        sound: 'default',
        vibration: true,
      });

      console.log('[NotificationService] Notifee channel initialized.');
    } catch (error) {
      console.error('[NotificationService] Initialization error:', error);
    }
  }

  static async scheduleNotification(
    eventId: string,
    medName: string,
    doseString: string,
    scheduledTime: Date
  ): Promise<string> {
    const timestamp = scheduledTime.getTime();
    
    // If the time is in the past, do not schedule
    if (timestamp <= Date.now()) {
      console.warn(`[NotificationService] Cannot schedule notification in the past for event ${eventId}`);
      return '';
    }

    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp,
      alarmManager: {
        allowWhileIdle: true, // Deliver even if device is in idle/doze mode (exact alarm)
      },
    };

    const notificationId = eventId; // Use eventId as notificationId for easy matching

    await notifee.createTriggerNotification(
      {
        id: notificationId,
        title: `Recordatorio: ${medName}`,
        body: `Es hora de tomar tu dosis: ${doseString}`,
        android: {
          channelId: this.CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          category: AndroidCategory.ALARM,
          sound: 'default',
          loopSound: true,
          fullScreenAction: {
            id: 'default',
            launchActivity: 'default',
          },
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: 'Tomada',
              pressAction: {
                id: 'taken',
              },
            },
            {
              title: 'Posponer (10 min)',
              pressAction: {
                id: 'snooze',
              },
            },
            {
              title: 'Omitir',
              pressAction: {
                id: 'skip',
              },
            },
          ],
        },
      },
      trigger
    );

    console.log(`[NotificationService] Notification scheduled for event ${eventId} at ${scheduledTime.toISOString()}`);
    return notificationId;
  }

  static async triggerImmediateNotification(
    title: string,
    body: string
  ): Promise<void> {
    try {
      await notifee.displayNotification({
        id: 'immediate-test-alarm',
        title,
        body,
        android: {
          channelId: this.CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          category: AndroidCategory.ALARM,
          sound: 'default',
          loopSound: true,
          fullScreenAction: {
            id: 'default',
            launchActivity: 'default',
          },
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: 'Tomada',
              pressAction: {
                id: 'taken',
              },
            },
            {
              title: 'Omitir',
              pressAction: {
                id: 'skip',
              },
            },
          ],
        },
      });
      console.log('[NotificationService] Immediate test alarm triggered.');
    } catch (error) {
      console.error('[NotificationService] Error triggering immediate alarm:', error);
    }
  }

  static async cancelNotification(notificationId: string) {
    if (!notificationId) return;
    try {
      await notifee.cancelNotification(notificationId);
      console.log(`[NotificationService] Cancelled notification for: ${notificationId}`);
    } catch (error) {
      console.error('[NotificationService] Cancel error:', error);
    }
  }

  static async cancelAllNotifications() {
    try {
      await notifee.cancelAllNotifications();
      console.log('[NotificationService] Cancelled all notifications.');
    } catch (error) {
      console.error('[NotificationService] Cancel all error:', error);
    }
  }
}
