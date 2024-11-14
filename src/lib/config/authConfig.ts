import { PublicClientApplication, LogLevel, type Configuration } from '@azure/msal-browser';
import { frontendConfig } from '$frontendConfig';
import { browser } from '$app/environment';

let msalInstance: PublicClientApplication | null = null;

const msalConfig: Configuration = {
    auth: {
        clientId: frontendConfig.azure.CLIENT_ID,
        authority: `https://login.microsoftonline.com/${frontendConfig.azure.TENANT_ID}`,
        redirectUri: frontendConfig.azure.REDIRECT_URI,
        navigateToLoginRequestUrl: false
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false
    },
    system: {
        loggerOptions: {
            logLevel: LogLevel.Error,
            loggerCallback: (level, message, containsPii) => {
                if (containsPii) return;
                if (level <= LogLevel.Error) {
                    console.error(message);
                }
            }
        }
    }
};

export const loginRequest = {
    scopes: ["User.Read", "email", "profile"]
};

export const getMsalInstance = async () => {
    if (!msalInstance) {
        msalInstance = new PublicClientApplication({
            ...msalConfig,
            system: {
                ...msalConfig.system,
                networkClient: {
                    sendGetRequestAsync: async (url: string, options: any) => {
                        const response = await fetch(url, options);
                        return {
                            headers: Object.fromEntries(response.headers.entries()),
                            body: await response.text(),
                            status: response.status
                        };
                    },
                    sendPostRequestAsync: async (url: string, options: any) => {
                        const response = await fetch(url, {
                            ...options,
                            method: 'POST'
                        });
                        return {
                            headers: Object.fromEntries(response.headers.entries()),
                            body: await response.text(),
                            status: response.status
                        };
                    }
                }
            }
        });
        await msalInstance.initialize();
    }
    return msalInstance;
};

export const graphConfig = {
    graphMeEndpoint: "https://graph.microsoft.com/v1.0/me"
}; 