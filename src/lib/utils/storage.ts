// Simple storage wrapper to handle access errors
export const safeStorage = {
  get(key: string): string | null {
    if (!window) return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('Storage access failed:', error);
      return null;
    }
  },

  set(key: string, value: string): boolean {
    if (!window) return false;
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('Storage access failed:', error);
      return false;
    }
  },

  remove(key: string): boolean {
    if (!window) return false;
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('Storage access failed:', error);
      return false;
    }
  }
}; 