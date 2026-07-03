import { isDev, isVerboseLogging } from './env';

// Centralized logging system to reduce console noise
export const Logger = {
  // Main routing events only
  info: (message: string, ...args: any[]) => {
    if (isDev()) {
      console.log(`🗺️ ${message}`, ...args);
    }
  },

  // Errors and warnings
  error: (message: string, ...args: any[]) => {
    console.error(`❌ ${message}`, ...args);
  },

  warn: (message: string, ...args: any[]) => {
    console.warn(`⚠️ ${message}`, ...args);
  },

  // Success messages
  success: (message: string, ...args: any[]) => {
    if (isDev()) {
      console.log(`✅ ${message}`, ...args);
    }
  },

  // Debug - only shows if VERBOSE_LOGGING is enabled
  debug: (message: string, ...args: any[]) => {
    if (isDev() && isVerboseLogging()) {
      console.log(`🔧 ${message}`, ...args);
    }
  },

  // Route analysis - special formatting
  routeAnalysis: (message: string, isGood: boolean = true) => {
    if (isDev()) {
      console.log(`%c[Route Analysis] ${message}`, 
                 isGood ? 'color: #51CF66;' : 'color: #FF6B6B;');
    }
  },

  // Performance timing
  time: (label: string) => {
    if (isDev()) {
      console.time(`⏱️ ${label}`);
    }
  },

  timeEnd: (label: string) => {
    if (isDev()) {
      console.timeEnd(`⏱️ ${label}`);
    }
  }
};

// Helper to check if verbose logging is enabled
export const isVerbose = () => isDev() && isVerboseLogging();
