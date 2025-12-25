/**
 * Configuration management for the server
 * Handles environment variables and application settings
 */

interface Config {
  port: number;
  environment: string;
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: string;
  database?: {
    url: string;
    name: string;
  };
  api?: {
    timeout: number;
    retries: number;
  };
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  environment: process.env.ENVIRONMENT || 'development',
  nodeEnv: (process.env.NODE_ENV as any) || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  database: process.env.DATABASE_URL
    ? {
        url: process.env.DATABASE_URL,
        name: process.env.DATABASE_NAME || 'hotel-scraper',
      }
    : undefined,
  api: {
    timeout: parseInt(process.env.API_TIMEOUT || '30000', 10),
    retries: parseInt(process.env.API_RETRIES || '3', 10),
  },
};

export default config;
