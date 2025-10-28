// App.tsx
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';

import Navigation from './src/navigation';
import BootSplash from './src/components/BootSplash';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { AppProvider } from './src/ui/providers/AppProvider';
import { askNotificationPermission, scheduleDailyCheck } from './src/notifications';

export default function App() {
  // Opcional: permisos y chequeo diario (queda no-op si están en stub)
  useEffect(() => {
    askNotificationPermission?.();
    scheduleDailyCheck?.();
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
