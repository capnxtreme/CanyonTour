// Centralized logging system to reduce console noise
export const Logger = {
  // Main routing events only
  info: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
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
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ ${message}`, ...args);
    }
  },

  // Debug - only shows if VERBOSE_LOGGING is enabled
  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
      console.log(`🔧 ${message}`, ...args);
    }
  },

  // Route analysis - special formatting
  routeAnalysis: (message: string, isGood: boolean = true) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`%c[Route Analysis] ${message}`, 
                 isGood ? 'color: #51CF66;' : 'color: #FF6B6B;');
    }
  },

  // Performance timing
  time: (label: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.time(`⏱️ ${label}`);
    }
  },

  timeEnd: (label: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(`⏱️ ${label}`);
    }
  }
};

// Helper to check if verbose logging is enabled
export const isVerbose = () => {
  return process.env.NODE_ENV === 'development' && process.env.REACT_APP_VERBOSE_LOGGING === 'true';
};