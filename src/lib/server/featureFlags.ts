// This file is only for server-side feature flags

import { GrowthbookProvider } from "@openfeature/growthbook-provider";
import { OpenFeature } from "@openfeature/server-sdk";

const GROWTHBOOK_CONFIG = {
  apiHost: process.env.VITE_GROWTHBOOK_API_HOST || "https://cdn.growthbook.io",
  clientKey: process.env.VITE_GROWTHBOOK_CLIENT_KEY || "sdk-FV3h5gU32IiG2L6",
  decryptionKey: process.env.VITE_GROWTHBOOK_ENCRYPTION_KEY || "sdk-FV3h5gU32IiG2L6",
};

// Initialize server-side feature flags
const provider = new GrowthbookProvider(GROWTHBOOK_CONFIG);
OpenFeature.setProvider(provider);

export const serverFlags = OpenFeature.getClient();
