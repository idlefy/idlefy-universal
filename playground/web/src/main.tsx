import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
