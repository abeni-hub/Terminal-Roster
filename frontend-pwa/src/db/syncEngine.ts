import { db } from './schema';

export class SyncEngine {
  private static isSyncing = false;

  static async triggerSync(deviceUuid: string, apiBaseUrl: string, token: string): Promise<{ success: boolean; syncedCount: number }> {
    if (this.isSyncing) {
      return { success: false, syncedCount: 0 };
    }

    if (!navigator.onLine) {
      console.warn('Sync aborted: Device is offline');
      return { success: false, syncedCount: 0 };
    }

    this.isSyncing = true;
    try {
      // 1. Fetch pending actions from outbox
      const actions = await db.syncQueue.toArray();
      if (actions.length === 0) {
        this.isSyncing = false;
        return { success: true, syncedCount: 0 };
      }

      console.log(`PWA Sync Engine: Syncing ${actions.length} pending operations...`);

      // 2. Format batch payload
      const syncActionsPayload = actions.map(act => ({
        action: act.action,
        payload: act.payload,
        timestamp: act.timestamp,
        syncId: act.payload.syncId || `${act.id}`
      }));

      const body = {
        deviceUuid,
        actions: syncActionsPayload
      };

      // 3. Make HTTP request to backend
      const response = await fetch(`${apiBaseUrl}/sync/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Sync server returned error code: ${response.status}`);
      }

      const result = await response.json();
      const succeededIds: string[] = result.succeeded || [];
      const failedRecords: { syncId: string; error: string }[] = result.failed || [];

      // 4. Clean up successful items in local DB
      for (const action of actions) {
        const syncId = action.payload.syncId || `${action.id}`;
        if (succeededIds.includes(syncId)) {
          // Delete from syncQueue outbox
          if (action.id) {
            await db.syncQueue.delete(action.id);
          }

          // If it was a dispatch, update local synced flag
          if (action.action === 'DISPATCH') {
            const localRecord = await db.dispatches.where('syncId').equals(syncId).first();
            if (localRecord) {
              await db.dispatches.update(localRecord.id, { isSynced: 1 });
            }
          }
        } else {
          // Check if this action is in the failed list, increment retry count
          const failMatch = failedRecords.find(f => f.syncId === syncId);
          if (failMatch && action.id) {
            await db.syncQueue.update(action.id, {
              retryCount: (action.retryCount || 0) + 1
            });
            console.error(`Action ${syncId} failed sync: ${failMatch.error}`);
          }
        }
      }

      console.log(`PWA Sync Engine: Sync complete. Succeeded: ${succeededIds.length}, Failed: ${failedRecords.length}`);
      this.isSyncing = false;
      return {
        success: true,
        syncedCount: succeededIds.length
      };
    } catch (error) {
      console.error('PWA Sync Engine Error:', error);
      this.isSyncing = false;
      return { success: false, syncedCount: 0 };
    }
  }

  // Hook background synchronization triggers
  static initAutoSync(deviceUuid: string, apiBaseUrl: string, getToken: () => string | null) {
    if (typeof window === 'undefined') return;

    // Trigger sync when connection is restored
    window.addEventListener('online', async () => {
      const token = getToken();
      if (token) {
        console.log('Network online. Triggering auto-sync...');
        await this.triggerSync(deviceUuid, apiBaseUrl, token);
      }
    });

    // Periodic sync check every 60 seconds
    setInterval(async () => {
      const token = getToken();
      if (token && navigator.onLine) {
        await this.triggerSync(deviceUuid, apiBaseUrl, token);
      }
    }, 60000);
  }
}
