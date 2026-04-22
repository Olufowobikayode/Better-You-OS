/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import MainLayout from './components/MainLayout';

export default function App() {
  useEffect(() => {
    // Initialize Telegram Mini App if running inside Telegram
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
  }, []);

  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
