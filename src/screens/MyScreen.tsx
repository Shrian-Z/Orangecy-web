import { useCallback, useEffect, useState } from 'react';
import { LogOut, Plus, User } from 'lucide-react';
import { PlatformConnectSheet } from '@/components/PlatformConnectSheet';
import { emptyConnections, PLATFORMS, PLATFORM_BY_ID } from '@/platforms';
import type { PlatformId } from '@/platforms';

export function MyScreen() {
  const [connected, setConnected] = useState<Record<PlatformId, boolean>>(emptyConnections);
  const [sheetOpen, setSheetOpen] = useState(false);

  const refresh = useCallback(async () => {
    await Promise.all(
      PLATFORMS.map(async (platform) => {
        try {
          const status = await platform.authStatus();
          setConnected((previous) =>
            previous[platform.id] === status.loggedIn
              ? previous
              : { ...previous, [platform.id]: status.loggedIn },
          );
        } catch {
          // 音源没起/没登录时保持未连接，不弹提示
        }
      }),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onConnected = useCallback((platform: PlatformId) => {
    setConnected((previous) => ({ ...previous, [platform]: true }));
  }, []);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const logoutPlatform = useCallback(async (platform: PlatformId) => {
    const config = PLATFORM_BY_ID.get(platform);
    if (!config) return;
    try {
      await config.logout();
      setConnected((previous) => ({ ...previous, [platform]: false }));
    } catch (error) {
      console.warn('[platform] logout failed', error);
    }
  }, []);

  const connectedPlatforms = PLATFORMS.filter((platform) => connected[platform.id]);

  return (
    <div className="my-page">
      <header className="my-head">
        <button
          type="button"
          className="icon-action my-add"
          onClick={() => setSheetOpen(true)}
          aria-label="添加音源"
        >
          <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>

      <div className="my-body">
        {connectedPlatforms.length ? (
          <div className="platform-list">
            {connectedPlatforms.map((platform) => {
              const Icon = platform.Icon;
              return (
                <div className="platform-row" key={platform.id}>
                  <span className="platform-icon" title={platform.label} aria-hidden="true">
                    <Icon size={24} strokeWidth={1.8} />
                  </span>
                  <button
                    type="button"
                    className="icon-action platform-logout"
                    onClick={() => void logoutPlatform(platform.id)}
                    aria-label={`断开${platform.label}`}
                  >
                    <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <span className="my-empty" aria-hidden="true">
            <User size={24} strokeWidth={1.6} />
          </span>
        )}
      </div>

      <PlatformConnectSheet
        open={sheetOpen}
        connected={connected}
        onClose={closeSheet}
        onConnected={onConnected}
      />
    </div>
  );
}
