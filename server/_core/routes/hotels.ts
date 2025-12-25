import express, { Router, Request, Response } from 'express';
import WebBedsScraper, { HotelSearchResult } from '../services/webbeds-scraper';
import Database from '../database';

const router = Router();
const db = new Database();
const scraper = new WebBedsScraper({
  headless: true,
  timeout: 30000,
  retryAttempts: 3,
  delayBetweenRequests: 2000,
});

// Predefined hotels with WebBeds IDs
const PREDEFINED_HOTELS = [
  { id: '2490015', name: 'M Hotel Al Dana Makkah by Millennium' },
  { id: '5150335', name: 'Novotel Thakher Makkah Hotel' },
  { id: '2548785', name: 'Voco Makkah' },
  { id: '22074', name: 'Elaf Ajyad Hotel' },
  { id: '2236075', name: 'Makkah al Aziziah EX' },
  { id: '5559815', name: 'Mercure Makkah Aziziah' },
  { id: '2308285', name: 'Four Points By Sheraton Makkah Al Naseem' },
  { id: '2113125', name: 'Ibis Styles Makkah' },
  { id: '1894035', name: 'ELAF BAKKAH HOTEL' },
];

/**
 * POST /api/hotels/search
 * Search for hotel prices
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { hotelName, checkInDate, checkOutDate } = req.body;

    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({
        error: 'Check-in and check-out dates are required',
      });
    }

    // Initialize scraper if not already done
    if (!scraper.isInitialized()) {
      await scraper.initialize();
    }

    let hotelNames: string[] = [];

    if (hotelName) {
      hotelNames = [hotelName];
    } else {
      hotelNames = PREDEFINED_HOTELS.map((h) => h.name);
    }

    const searchResults = await scraper.searchMultipleHotels(
      hotelNames,
      checkInDate,
      checkOutDate
    );

    // Save results to database
    for (const result of searchResults) {
      await db.saveHotelPrice(result);
    }

    res.json({
      success: true,
      count: searchResults.length,
      hotels: searchResults,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Search error:', errorMsg);
    res.status(500).json({
      error: 'Failed to search hotels',
      details: errorMsg,
    });
  }
});

/**
 * POST /api/hotels/add
 * Add a new hotel
 */
router.post('/add', async (req: Request, res: Response) => {
  try {
    const { name, hotelId } = req.body;

    if (!name || !hotelId) {
      return res.status(400).json({
        error: 'Hotel name and WebBeds ID are required',
      });
    }

    const hotel = await db.addHotel(name, hotelId);

    res.status(201).json({
      success: true,
      message: 'Hotel added successfully',
      hotel,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Add hotel error:', errorMsg);
    res.status(500).json({
      error: 'Failed to add hotel',
      details: errorMsg,
    });
  }
});

/**
 * GET /api/hotels
 * Get all hotels
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const hotels = await db.getAllHotels();
    res.json({
      success: true,
      count: hotels.length,
      hotels,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Get hotels error:', errorMsg);
    res.status(500).json({
      error: 'Failed to retrieve hotels',
      details: errorMsg,
    });
  }
});

/**
 * GET /api/hotels/:id
 * Get hotel details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const hotel = await db.getHotel(id);

    if (!hotel) {
      return res.status(404).json({
        error: 'Hotel not found',
      });
    }

    const priceHistory = await db.getHotelPriceHistory(id);

    res.json({
      success: true,
      hotel,
      priceHistory,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Get hotel error:', errorMsg);
    res.status(500).json({
      error: 'Failed to retrieve hotel',
      details: errorMsg,
    });
  }
});

/**
 * POST /api/hotels/:id/scrape
 * Scrape hotel prices for specific dates
 */
router.post('/:id/scrape', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { checkInDate, checkOutDate } = req.body;

    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({
        error: 'Check-in and check-out dates are required',
      });
    }

    const hotel = await db.getHotel(id);
    if (!hotel) {
      return res.status(404).json({
        error: 'Hotel not found',
      });
    }

    // Initialize scraper if not already done
    if (!scraper.isInitialized()) {
      await scraper.initialize();
    }

    const result = await scraper.searchHotelPrices(
      hotel.name,
      checkInDate,
      checkOutDate
    );

    if (result) {
      await db.saveHotelPrice({
        ...result,
        hotelId: id,
      });
    }

    res.json({
      success: true,
      message: 'Hotel scraped successfully',
      result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Scrape error:', errorMsg);
    res.status(500).json({
      error: 'Failed to scrape hotel',
      details: errorMsg,
    });
  }
});

/**
 * DELETE /api/hotels/:id
 * Delete a hotel
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.deleteHotel(id);

    if (!result) {
      return res.status(404).json({
        error: 'Hotel not found',
      });
    }

    res.json({
      success: true,
      message: 'Hotel deleted successfully',
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Delete hotel error:', errorMsg);
    res.status(500).json({
      error: 'Failed to delete hotel',
      details: errorMsg,
    });
  }
});

/**
 * GET /api/hotels/compare
 * Compare prices for all hotels
 */
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const { checkInDate, checkOutDate } = req.query;

    const comparison = await db.comparePrices(
      checkInDate as string,
      checkOutDate as string
    );

    res.json({
      success: true,
      comparison,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Compare error:', errorMsg);
    res.status(500).json({
      error: 'Failed to compare prices',
      details: errorMsg,
    });
  }
});

/**
 * GET /api/hotels/:id/history
 * Get price history for a hotel
 */
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 30 } = req.query;

    const history = await db.getHotelPriceHistory(id, parseInt(limit as string));

    res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Get history error:', errorMsg);
    res.status(500).json({
      error: 'Failed to retrieve price history',
      details: errorMsg,
    });
  }
});

/**
 * GET /api/hotels/predefined
 * Get list of predefined hotels
 */
router.get('/predefined', (req: Request, res: Response) => {
  res.json({
    success: true,
    count: PREDEFINED_HOTELS.length,
    hotels: PREDEFINED_HOTELS,
  });
});

export default router;