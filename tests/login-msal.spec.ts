import { test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { ConfidentialClientApplication, AuthenticationResult } from "@azure/msal-node";

const BASE_URL = Bun.env.PUBLIC_BASE_URL || 'http://localhost:5173';
const CLIENT_ID = Bun.env.PUBLIC_AZURE_CLIENT_ID;

let browser: Browser;
let context: BrowserContext;
let page: Page;

// Azure AD configuration
const msalConfig = {
    auth: {
        clientId: Bun.env.PUBLIC_AZURE_CLIENT_ID!,
        clientSecret: Bun.env.PUBLIC_AZURE_CLIENT_SECRET!,
        authority: `https://login.microsoftonline.com/${Bun.env.PUBLIC_AZURE_TENANT_ID}`
    }
};

async function getAuthToken(): Promise<AuthenticationResult> {
    const cca = new ConfidentialClientApplication(msalConfig);
    try {
        return await cca.acquireTokenByClientCredential({
            scopes: ["https://graph.microsoft.com/.default"]
        });
    } catch (error) {
        console.error('Failed to acquire token:', error);
        throw error;
    }
}

beforeAll(async () => {
    browser = await chromium.launch({ headless: false });
});

afterAll(async () => {
    await browser.close();
});

beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
});

test("should authenticate and access protected content", async () => {
    try {
        const tokenResponse = await getAuthToken();
        if (!tokenResponse?.accessToken) {
            throw new Error('Failed to acquire access token');
        }

        await page.goto(BASE_URL);
        await page.waitForLoadState('networkidle');

        await page.evaluate(({ token, clientId, tenantId, username }) => {
            sessionStorage.setItem('isAuthenticated', 'true');
            sessionStorage.setItem('msal.token.keys', '["accessToken"]');
            sessionStorage.setItem('accessToken', token);

            const msalTokenKey = `msal.${clientId}.token`;
            const msalAccountKey = `msal.${clientId}.account.keys`;
            const accountId = 'test-account-id';

            sessionStorage.setItem(msalTokenKey, JSON.stringify({
                accessToken: token,
                tokenType: "Bearer",
                expiresIn: 3600,
                scope: "https://graph.microsoft.com/.default",
                clientId: clientId
            }));

            sessionStorage.setItem(msalAccountKey, JSON.stringify([accountId]));
            sessionStorage.setItem(`msal.${clientId}.account.${accountId}`, JSON.stringify({
                homeAccountId: accountId,
                environment: "login.microsoftonline.com",
                tenantId: tenantId,
                username: username || "test@example.com"
            }));
        }, {
            token: tokenResponse.accessToken,
            clientId: CLIENT_ID,
            tenantId: Bun.env.PUBLIC_AZURE_TENANT_ID,
            username: Bun.env.PUBLIC_AZURE_USERNAME || "test@example.com"
        });

        await page.waitForTimeout(1000);
        await page.reload();
        await page.waitForLoadState('networkidle');

        const collectionButton = await page.waitForSelector(
            'button[data-transaction-name^="Toggle Collection:"]',
            { timeout: 15000, state: 'visible' }
        );
        expect(collectionButton).toBeTruthy();

    } catch (error) {
        console.error('Test failed:', error);
        if (page) {
            await page.screenshot({ path: `auth-failure-${Date.now()}.png`, fullPage: true });
        }
        throw error;
    }
});

test("should redirect to login when not authenticated", async () => {
    try {
        const cleanContext = await browser.newContext();
        const cleanPage = await cleanContext.newPage();

        await cleanPage.goto(BASE_URL);
        await cleanPage.waitForURL('**/login', { timeout: 5000 });

        const loginButton = await cleanPage.waitForSelector(
            'button[data-transaction-name="Sign In button"]',
            { timeout: 5000 }
        );
        expect(await loginButton.isVisible()).toBe(true);

        await cleanContext.close();
    } catch (error) {
        console.error('Redirect test failed:', error);
        await page.screenshot({ path: `redirect-failure-${Date.now()}.png`, fullPage: true });
        throw error;
    }
});