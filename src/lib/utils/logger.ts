const isDevelopment = import.meta.env.MODE === 'development';

export const log = {
    info: (message: string, ...args: any[]) => {
        if (isDevelopment) {
            console.log(message, ...args);
        }
    },
    error: (message: string, ...args: any[]) => {
        if (isDevelopment) {
            console.error(message, ...args);
        }
    },
    warn: (message: string, ...args: any[]) => {
        if (isDevelopment) {
            console.warn(message, ...args);
        }
    }
}; 