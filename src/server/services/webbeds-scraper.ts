import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';

/**
 * Interface representing a hotel search result from WebBeds
 */
export interface HotelSearchResult {
  hotelId: string;
  name: string;
  price: number;
  currency: string;
  checkIn: string;
  checkOut: string;
}

/**
 * Configuration options for WebBedsScraper
 */
interface ScraperConfig {
  headless?: boolean;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  userAgent?: string;
  proxy?: string;
}

/**
 * Retry configuration with exponential backoff
 */
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * WebBeds hotel scraper service
 * Handles searching and extracting hotel prices from WebBeds platform
 */
export class WebBedsScraper {
  private browser: Browser | null = null;
  private config: Required<ScraperConfig>;
  private retryConfig: RetryConfig;

  constructor(config: ScraperConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      userAgent: config.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      proxy: config.proxy ?? '',
    };

    this.retryConfig = {
      maxRetries: this.config.maxRetries,
      initialDelay: this.config.retryDelay,
      maxDelay: 30000,
      backoffMultiplier: 2,
    };

    logger.info('WebBedsScraper initialized with config', { config: this.config });
  }

  /**
   * Launch browser with Puppeteer and retry logic
   * @throws Error if browser fails to launch after all retries
   */
  async launchBrowser(): Promise<void> {
    logger.info('Launching browser...');
    
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const launchArgs: puppeteer.PuppeteerLaunchArgs = {
          headless: this.config.headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        };

        if (this.config.proxy) {
          launchArgs.args!.push(`--proxy-server=${this.config.proxy}`);
        }

        this.browser = await puppeteer.launch(launchArgs);
        
        logger.info('Browser launched successfully');
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const delay = this.calculateBackoffDelay(attempt);
        logger.warn(`Browser launch failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`, {
          error: lastError.message,
          nextRetryIn: `${delay}ms`,
        });

        if (attempt < this.retryConfig.maxRetries) {
          await this.delay(delay);
        }
      }
    }

    throw new Error(`Failed to launch browser after ${this.retryConfig.maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Search multiple hotels with retry logic
   * @param hotelIds Array of hotel IDs to search
   * @param checkIn Check-in date (YYYY-MM-DD)
   * @param checkOut Check-out date (YYYY-MM-DD)
   * @param guests Number of guests
   * @returns Array of hotel search results
   */
  async searchHotels(
    hotelIds: string[],
    checkIn: string,
    checkOut: string,
    guests: number,
  ): Promise<HotelSearchResult[]> {
    logger.info('Starting hotel search', {
      hotelCount: hotelIds.length,
      checkIn,
      checkOut,
      guests,
    });

    const results: HotelSearchResult[] = [];
    const errors: { hotelId: string; error: string }[] = [];

    for (const hotelId of hotelIds) {
      try {
        const result = await this.searchSingleHotel(hotelId, checkIn, checkOut, guests);
        results.push(result);
        logger.info(`Successfully searched hotel ${hotelId}`, { hotelId });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ hotelId, error: errorMessage });
        logger.error(`Failed to search hotel ${hotelId}`, {
          hotelId,
          error: errorMessage,
        });
      }
    }

    if (errors.length > 0) {
      logger.warn(`Hotel search completed with errors`, {
        successCount: results.length,
        errorCount: errors.length,
        errors,
      });
    }

    return results;
  }

  /**
   * Search a single hotel with retry logic
   * @param hotelId Hotel ID
   * @param checkIn Check-in date (YYYY-MM-DD)
   * @param checkOut Check-out date (YYYY-MM-DD)
   * @param guests Number of guests
   * @returns Hotel search result
   * @throws Error if search fails after all retries
   */
  async searchSingleHotel(
    hotelId: string,
    checkIn: string,
    checkOut: string,
    guests: number,
  ): Promise<HotelSearchResult> {
    return this.withRetry(
      async () => {
        if (!this.browser) {
          throw new Error('Browser not initialized. Call launchBrowser() first.');
        }

        const page = await this.browser.newPage();
        
        try {
          // Set viewport and user agent
          await page.setViewport({ width: 1920, height: 1080 });
          await page.setUserAgent(this.config.userAgent);
          
          // Set timeout
          page.setDefaultNavigationTimeout(this.config.timeout);
          page.setDefaultTimeout(this.config.timeout);

          // Build search URL
          const searchUrl = this.buildSearchUrl(hotelId, checkIn, checkOut, guests);
          
          logger.info(`Navigating to ${searchUrl}`, { hotelId });
          await page.goto(searchUrl, { waitUntil: 'networkidle2' });

          // Wait for price elements to load
          await page.waitForSelector('[data-price], .price, [class*="price"]', {
            timeout: 10000,
          }).catch(() => {
            logger.warn('Price selector not found, proceeding with HTML parsing', { hotelId });
          });

          // Extract hotel information
          const html = await page.content();
          const result = await this.extractPrices(html, hotelId, checkIn, checkOut);

          return result;
        } finally {
          await page.close();
        }
      },
      `searchSingleHotel for hotel ${hotelId}`,
    );
  }

  /**
   * Extract hotel prices and information from HTML using Cheerio
   * @param html HTML content to parse
   * @param hotelId Hotel ID
   * @param checkIn Check-in date
   * @param checkOut Check-out date
   * @returns Extracted hotel search result
   * @throws Error if unable to extract required data
   */
  async extractPrices(
    html: string,
    hotelId: string,
    checkIn: string,
    checkOut: string,
  ): Promise<HotelSearchResult> {
    try {
      const $ = cheerio.load(html);

      // Extract hotel name
      const name = this.extractHotelName($) || 'Unknown Hotel';

      // Extract price and currency
      const { price, currency } = this.extractPriceInfo($);

      if (price === null || currency === null) {
        throw new Error('Unable to extract price information from HTML');
      }

      logger.debug('Extracted hotel data', {
        hotelId,
        name,
        price,
        currency,
      });

      return {
        hotelId,
        name,
        price,
        currency,
        checkIn,
        checkOut,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to extract prices from HTML', {
        hotelId,
        error: errorMessage,
      });
      throw new Error(`Failed to extract prices: ${errorMessage}`);
    }
  }

  /**
   * Extract hotel name from HTML
   * @param $ Cheerio instance
   * @returns Hotel name or null if not found
   */
  private extractHotelName($: cheerio.CheerioAPI): string | null {
    // Try multiple selectors for hotel name
    const selectors = [
      'h1[data-testid="hotel-name"]',
      '.hotel-name',
      '[class*="hotel-title"]',
      'h1',
    ];

    for (const selector of selectors) {
      const name = $(selector).first().text().trim();
      if (name) {
        return name;
      }
    }

    return null;
  }

  /**
   * Extract price and currency from HTML
   * @param $ Cheerio instance
   * @returns Object with price and currency, or null values if not found
   */
  private extractPriceInfo($: cheerio.CheerioAPI): { price: number | null; currency: string | null } {
    // Try multiple selectors for price
    const priceSelectors = [
      '[data-price]',
      '.price',
      '[class*="price"]',
      '.total-price',
      '[class*="total"]',
    ];

    for (const selector of priceSelectors) {
      const priceElement = $(selector).first();
      if (priceElement.length > 0) {
        const priceText = priceElement.text().trim();
        const { price, currency } = this.parsePriceString(priceText);
        
        if (price !== null && currency !== null) {
          return { price, currency };
        }
      }
    }

    // Fallback: search for price patterns in text
    const bodyText = $('body').text();
    const priceMatch = this.extractPriceFromText(bodyText);
    
    if (priceMatch) {
      return priceMatch;
    }

    return { price: null, currency: null };
  }

  /**
   * Parse price string and extract numeric price and currency
   * @param priceString Price string (e.g., "$100.00", "€50,00")
   * @returns Object with price and currency
   */
  private parsePriceString(priceString: string): { price: number | null; currency: string | null } {
    // Remove whitespace
    const cleaned = priceString.trim();

    // Currency symbols and codes
    const currencyPatterns = [
      { symbol: '$', code: 'USD' },
      { symbol: '€', code: 'EUR' },
      { symbol: '£', code: 'GBP' },
      { symbol: '¥', code: 'JPY' },
      { symbol: '₹', code: 'INR' },
    ];

    let currency: string | null = null;
    let numberPart = cleaned;

    // Check for currency symbols
    for (const { symbol, code } of currencyPatterns) {
      if (cleaned.includes(symbol)) {
        currency = code;
        numberPart = cleaned.replace(symbol, '').trim();
        break;
      }
    }

    // Check for currency codes
    const currencyCodeMatch = cleaned.match(/\b(USD|EUR|GBP|JPY|INR|CAD|AUD)\b/i);
    if (currencyCodeMatch) {
      currency = currencyCodeMatch[1].toUpperCase();
      numberPart = cleaned.replace(currencyCodeMatch[1], '').trim();
    }

    // Extract numeric value
    const numberMatch = numberPart.match(/[\d,.\s]+/);
    if (!numberMatch) {
      return { price: null, currency };
    }

    // Parse number (handle both . and , as decimal separators)
    let priceString_clean = numberMatch[0].trim();
    priceString_clean = priceString_clean.replace(/\s+/g, ''); // Remove spaces
    
    // Handle different decimal separators
    if (priceString_clean.includes('.') && priceString_clean.includes(',')) {
      // Handle formats like 1,234.56 or 1.234,56
      if (priceString_clean.lastIndexOf('.') > priceString_clean.lastIndexOf(',')) {
        priceString_clean = priceString_clean.replace(/,/g, ''); // Remove commas (thousand separator)
      } else {
        priceString_clean = priceString_clean.replace(/\./g, '').replace(/,/g, '.'); // Replace comma with dot
      }
    } else if (priceString_clean.includes(',')) {
      priceString_clean = priceString_clean.replace(/,/g, '.'); // Replace comma with dot
    }

    const price = parseFloat(priceString_clean);

    if (isNaN(price)) {
      return { price: null, currency };
    }

    return { price, currency: currency || 'USD' };
  }

  /**
   * Extract price from unstructured text
   * @param text Text to search
   * @returns Object with price and currency or null
   */
  private extractPriceFromText(text: string): { price: number | null; currency: string | null } | null {
    // Pattern to match prices: optional currency symbol + digits with commas/dots + optional decimals
    const pricePattern = /[$€£¥₹]?\s*[\d,]+(?:[.,]\d{2})?/g;
    const matches = text.match(pricePattern);

    if (matches && matches.length > 0) {
      // Take the first significant-looking price
      for (const match of matches) {
        const result = this.parsePriceString(match);
        if (result.price !== null && result.price > 0) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Build search URL for WebBeds
   * @param hotelId Hotel ID
   * @param checkIn Check-in date (YYYY-MM-DD)
   * @param checkOut Check-out date (YYYY-MM-DD)
   * @param guests Number of guests
   * @returns Search URL
   */
  private buildSearchUrl(hotelId: string, checkIn: string, checkOut: string, guests: number): string {
    const baseUrl = 'https://www.webbeds.com';
    const params = new URLSearchParams({
      hotelId,
      checkIn,
      checkOut,
      guests: String(guests),
    });

    return `${baseUrl}/search?${params.toString()}`;
  }

  /**
   * Execute a function with retry logic and exponential backoff
   * @param fn Function to execute
   * @param operationName Name of operation for logging
   * @returns Result of function
   * @throws Error if all retries fail
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          logger.warn(`${operationName} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`, {
            error: lastError.message,
            nextRetryIn: `${delay}ms`,
          });
          await this.delay(delay);
        } else {
          logger.error(`${operationName} failed after all retries`, {
            totalAttempts: this.retryConfig.maxRetries + 1,
            error: lastError.message,
          });
        }
      }
    }

    throw lastError || new Error(`${operationName} failed after ${this.retryConfig.maxRetries + 1} attempts`);
  }

  /**
   * Calculate exponential backoff delay
   * @param attempt Current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
    const delay = Math.min(exponentialDelay, this.retryConfig.maxDelay);
    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random();
    return Math.floor(delay + jitter);
  }

  /**
   * Utility function to delay execution
   * @param ms Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Close browser and cleanup resources
   */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        logger.info('Browser closed successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error closing browser', { error: errorMessage });
        throw new Error(`Failed to close browser: ${errorMessage}`);
      }
    }
  }

  /**
   * Check if browser is currently running
   * @returns True if browser is initialized
   */
  isBrowserActive(): boolean {
    return this.browser !== null;
  }
}

export default WebBedsScraper;