import type { DesktopAPI } from '../../shared/desktopApi';

declare global { interface Window { desktopAPI: DesktopAPI } }
export {};
