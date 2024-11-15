if (typeof window !== 'undefined' && !window.process) {
    window.process = {
        env: {},
        platform: 'browser',
        version: '',
    } as any;
} 