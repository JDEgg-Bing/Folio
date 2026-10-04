import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ElectronPlatformService } from './platform/ElectronPlatformService';
import { createLocalPreferences } from './preferences/PreferencesService';
import 'katex/dist/katex.min.css';
import './styles/variables.css';
import './styles/app.css';
import './styles/editor.css';
import './styles/titlebar.css';
import './styles/design-system.css';

const platform = new ElectronPlatformService();
const preferences = createLocalPreferences();
const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App platform={platform} preferences={preferences} /></React.StrictMode>);
