import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';

/**
 * Interface for hotel search results
 */
export interface HotelSearchResult {
  hotelId: string;
  hotelName: string;
  price: number;
  currency: string;
  checkIn: string;
  checkOut: string;
  rating: number | null;
  image: string | null;
  url: string;
}

/**
 * Configuration interface for WebBeds scraper
 */
interface ScraperConfig {
  headless?: boolean;
  timeout?: number;
  retryAttempts?: number;
  delayBetweenRequests?: number;
  userAgent?: string;
}

/**
 * WebBeds Scraper Service
 * Handles scraping hotel prices from WebBeds using Puppeteer
 */
export class WebBedsScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: Required<ScraperConfig>;
  private readonly WEBBEDS_BASE_URL = 'https://www.webbeds.com';
  private readonly HOTEL_SEARCH_URL = `${this.WEBBEDS_BASE_URL}/en/hotels`;

  constructor(config: ScraperConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 3,
      delayBetweenRequests: config.delayBetweenRequests ?? 2000,
      userAgent: config.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
  }

  /**
   * Initialize the browser and create a new page
   */
  async initialize(): Promise<void> {
    try {
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 720 });
      await this.page.setUserAgent(this.config.userAgent);
      await this.page.setDefaultNavigationTimeout(this.config.timeout);
      await this.page.setDefaultTimeout(this.config.timeout);

      // Set default headers to reduce blocking
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });

      console.log('WebBeds Scraper initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize WebBeds Scraper: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Close the browser and cleanup resources
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      console.log('WebBeds Scraper closed successfully');
    } catch (error) {
      console.error(`Error closing WebBeds Scraper: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add delay to avoid rate limiting
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse hotel price from HTML element text
   */
  private extractPrice(priceText: string): { price: number; currency: string } {
    const priceMatch = priceText.match(/([^\d]*)([\d,.]+)/);
    if (!priceMatch) {
      return { price: 0, currency: 'USD' };
    }

    const currency = priceMatch[1]?.trim() || 'USD';
    const priceStr = priceMatch[2].replace(/[,.]/g, (match) => {
      // Handle both European (1.234,56) and US (1,234.56) formats
      const parts = priceMatch[2].split(/[.,]/);
      return parts.length > 2 ? '' : match === ',' ? '.' : '';
    });

    const price = parseFloat(priceStr);
    return { price: isNaN(price) ? 0 : price, currency };
  }

  /**
   * Retry wrapper for network requests
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `Attempt ${attempt} failed for ${operationName}: ${lastError.message}`
        );

        if (attempt < this.config.retryAttempts) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this.delay(backoffDelay);
        }
      }
    }

    throw new Error(
      `Failed to complete ${operationName} after ${this.config.retryAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Search for a single hotel and return pricing information
   */
  async searchHotelPrices(
    hotelName: string,
    checkInDate: string,
    checkOutDate: string
  ): Promise<HotelSearchResult | null> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    try {
      const searchUrl = `${this.HOTEL_SEARCH_URL}?s=${encodeURIComponent(
        hotelName
      )}&checkIn=${checkInDate}&checkOut=${checkOutDate}`;

      await this.retryOperation(
        () => this.page!.goto(searchUrl, { waitUntil: 'networkidle2' }),
        `navigate to ${hotelName} search`
      );

      // Wait for search results to load
      await this.retryOperation(
        () =>
          this.page!.waitForSelector(
            '[data-testid="hotel-card"], .hotel-result, .hotel-item',
            { timeout: 10000 }
          ),
        `wait for hotel results for ${hotelName}`
      );

      const pageContent = await this.page.content();
      const $ = cheerio.load(pageContent);

      // Extract hotel information from search results
      const hotelCard = $('[data-testid="hotel-card"]').first();

      if (!hotelCard.length) {
        console.warn(`No results found for hotel: ${hotelName}`);
        return null;
      }

      const hotelId = hotelCard.attr('data-hotel-id') || `hotel_${Date.now()}`;
      const name = hotelCard.find('[data-testid="hotel-name"]').text().trim();
      const priceText = hotelCard.find('[data-testid="hotel-price"]').text().trim();
      const { price, currency } = this.extractPrice(priceText);
      const ratingText = hotelCard.find('[data-testid="hotel-rating"]').text().trim();
      const rating = parseFloat(ratingText) || null;
      const image = hotelCard.find('img').attr('src') || null;
      const url = this.WEBBEDS_BASE_URL + (hotelCard.find('a').attr('href') || '');

      return {
        hotelId,
        hotelName: name || hotelName,
        price,
        currency,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        rating,
        image,
        url,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error searching hotel ${hotelName}: ${errorMsg}`);
      throw new Error(`Failed to search hotel ${hotelName}: ${errorMsg}`);
    }
  }

  /**
   * Search for multiple hotels concurrently
   */
  async searchMultipleHotels(
    hotelNames: string[],
    checkInDate: string,
    checkOutDate: string
  ): Promise<HotelSearchResult[]> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    if (!Array.isArray(hotelNames) || hotelNames.length === 0) {
      throw new Error('hotelNames must be a non-empty array');
    }

    // Validate dates
    if (!this.isValidDateFormat(checkInDate) || !this.isValidDateFormat(checkOutDate)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    if (new Date(checkInDate) >= new Date(checkOutDate)) {
      throw new Error('Check-in date must be before check-out date');
    }

    const results: HotelSearchResult[] = [];

    for (let i = 0; i < hotelNames.length; i++) {
      try {
        console.log(`Searching hotel ${i + 1}/${hotelNames.length}: ${hotelNames[i]}`);

        const result = await this.searchHotelPrices(
          hotelNames[i],
          checkInDate,
          checkOutDate
        );

        if (result) {
          results.push(result);
        }

        // Add delay between requests to avoid rate limiting
        if (i < hotelNames.length - 1) {
          await this.delay(this.config.delayBetweenRequests);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error searching hotel ${hotelNames[i]}: ${errorMsg}`);
        // Continue with next hotel instead of failing completely
      }
    }

    if (results.length === 0) {
      console.warn('No hotels found in the search');
    }

    return results;
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  private isValidDateFormat(dateString: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
      return false;
    }

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Get current browser status
   */
  isInitialized(): boolean {
    return this.browser !== null && this.page !== null;
  }

  /**
   * Set custom delay between requests (in milliseconds)
   */
  setDelayBetweenRequests(delayMs: number): void {
    if (delayMs < 0) {
      throw new Error('Delay must be a non-negative number');
    }
    this.config.delayBetweenRequests = delayMs;
  }

  /**
   * Get scraper configuration
   */
  getConfig(): Required<ScraperConfig> {
    return { ...this.config };
  }
}

export default WebBedsScraper;
