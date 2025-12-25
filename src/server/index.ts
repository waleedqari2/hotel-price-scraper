/**
 * Main server entry point
 * Initializes and starts the hotel price scraper server
 */

import config from './config';
import { logger } from './utils/logger';
import hotelRoutes from './routes/hotels';

/**
 * Initialize the server
 */
const initializeServer = async (): Promise<void> => {
  try {
    logger.info('Initializing server', {
      environment: config.environment,
      nodeEnv: config.nodeEnv,
      port: config.port,
    });

    // TODO: Initialize database connection if configured
    if (config.database) {
      logger.info('Database configured', {
        name: config.database.name,
      });
      // Database initialization logic here
    }

    // TODO: Set up HTTP server (Express, Fastify, etc.)
    // TODO: Register routes
    // TODO: Set up middleware

    logger.info('Server initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize server', { error: String(error) });
    process.exit(1);
  }
};

/**
 * Start the server
 */
const startServer = async (): Promise<void> => {
  try {
    await initializeServer();

    // TODO: Start listening on configured port
    logger.info(`Server is running on port ${config.port}`, {
      environment: config.environment,
    });

    // TODO: Implement graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      // Cleanup logic here
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT signal received: closing HTTP server');
      // Cleanup logic here
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: String(error) });
    process.exit(1);
  }
};

// Start the server if this module is run directly
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Unexpected error', { error: String(error) });
    process.exit(1);
  });
}

export { startServer, initializeServer, hotelRoutes };
export default { startServer, initializeServer, hotelRoutes };
