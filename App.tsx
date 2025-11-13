// App.tsx
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';

import Navigation from './src/navigation';
import BootSplash from './src/components/BootSplash';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { AppProvider } from './src/ui/providers/AppProvider';
import { askNotificationPermission, scheduleDailyCheck } from './src/notifications';

export default function App() {
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await askNotificationPermission();   // pide permiso primero
        if (!mounted) return;
        await scheduleDailyCheck();          // refresca/programa avisos de vencimiento
      } catch (e) {
        console.log('[App] init notifications error', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <ThemeProvider>
      <AppProvider>
        <StatusBar barStyle="dark-content" />
        <Navigation />
        <BootSplash />
      </AppProvider>
    </ThemeProvider>
  );
}
