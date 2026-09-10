import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
