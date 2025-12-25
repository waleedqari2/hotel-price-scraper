import sqlite3 from 'sqlite3';
import { open, Database as SqliteDatabase } from 'sqlite';
import path from 'path';
import { HotelSearchResult } from './services/webbeds-scraper';

interface Hotel {
  id: string;
  hotelId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface HotelPrice {
  id: string;
  hotelId: string;
  price: number;
  currency: string;
  checkInDate: string;
  checkOutDate: string;
  recordedAt: string;
}

export class Database {
  private db: SqliteDatabase<sqlite3.Database, sqlite3.Statement> | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'hotels.db');
  }

  async initialize(): Promise<void> {
    try {
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database,
      });

      await this.createTables();
      await this.insertPredefinedHotels();

      console.log(`Database initialized at ${this.dbPath}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize database: ${errorMsg}`);
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS hotels (
        id TEXT PRIMARY KEY,
        hotel_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS hotel_prices (
        id TEXT PRIMARY KEY,
        hotel_id TEXT NOT NULL,
        price REAL NOT NULL,
        currency TEXT NOT NULL,
        check_in_date DATE NOT NULL,
        check_out_date DATE NOT NULL,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id)
      )
    `);

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hotel_prices_hotel_id 
      ON hotel_prices(hotel_id);
    `);

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hotel_prices_dates 
      ON hotel_prices(check_in_date, check_out_date);
    `);
  }

  private async insertPredefinedHotels(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const predefinedHotels = [
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

    for (const hotel of predefinedHotels) {
      try {
        const dbId = `hotel_${hotel.id}`;
        await this.db.run(
          'INSERT OR IGNORE INTO hotels (id, hotel_id, name) VALUES (?, ?, ?)',
          [dbId, hotel.id, hotel.name]
        );
      } catch (error) {
        console.warn(`Failed to insert hotel ${hotel.name}:`, error);
      }
    }
  }

  async addHotel(name: string, hotelId: string): Promise<Hotel> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `hotel_${Date.now()}`;

    try {
      await this.db.run(
        'INSERT INTO hotels (id, hotel_id, name) VALUES (?, ?, ?)',
        [id, hotelId, name]
      );

      return {
        id,
        hotelId,
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add hotel: ${errorMsg}`);
    }
  }

  async getAllHotels(): Promise<Hotel[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const hotels = await this.db.all(`
        SELECT id, hotel_id, name, created_at, updated_at 
        FROM hotels 
        ORDER BY created_at DESC
      `);

      return hotels.map((h: any) => ({
        id: h.id,
        hotelId: h.hotel_id,
        name: h.name,
        createdAt: h.created_at,
        updatedAt: h.updated_at,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get hotels: ${errorMsg}`);
    }
  }

  async getHotel(id: string): Promise<Hotel | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const hotel = await this.db.get(`
        SELECT id, hotel_id, name, created_at, updated_at 
        FROM hotels 
        WHERE id = ?
      `, [id]);

      if (!hotel) return null;

      return {
        id: hotel.id,
        hotelId: hotel.hotel_id,
        name: hotel.name,
        createdAt: hotel.created_at,
        updatedAt: hotel.updated_at,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get hotel: ${errorMsg}`);
    }
  }

  async deleteHotel(id: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.run('DELETE FROM hotels WHERE id = ?', [id]);
      return (result?.changes ?? 0) > 0;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete hotel: ${errorMsg}`);
    }
  }

  async saveHotelPrice(result: HotelSearchResult): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `price_${Date.now()}`;

    try {
      await this.db.run(
        `INSERT INTO hotel_prices 
         (id, hotel_id, price, currency, check_in_date, check_out_date) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, result.hotelId, result.price, result.currency, result.checkIn, result.checkOut]
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to save hotel price: ${errorMsg}`);
    }
  }

  async getHotelPriceHistory(hotelId: string, limit: number = 30): Promise<HotelPrice[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const prices = await this.db.all(
        `SELECT id, hotel_id, price, currency, check_in_date, check_out_date, recorded_at 
         FROM hotel_prices 
         WHERE hotel_id = ? 
         ORDER BY recorded_at DESC 
         LIMIT ?`,
        [hotelId, limit]
      );

      return prices.map((p: any) => ({
        id: p.id,
        hotelId: p.hotel_id,
        price: p.price,
        currency: p.currency,
        checkInDate: p.check_in_date,
        checkOutDate: p.check_out_date,
        recordedAt: p.recorded_at,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get price history: ${errorMsg}`);
    }
  }

  async comparePrices(checkInDate?: string, checkOutDate?: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      let query = `
        SELECT 
          h.id,
          h.hotel_id,
          h.name,
          hp.price,
          hp.currency,
          hp.check_in_date,
          hp.check_out_date,
          hp.recorded_at,
          ROW_NUMBER() OVER (PARTITION BY h.id ORDER BY hp.recorded_at DESC) as rn
        FROM hotels h
        LEFT JOIN hotel_prices hp ON h.hotel_id = hp.hotel_id
      `;

      const params: any[] = [];

      if (checkInDate && checkOutDate) {
        query += ' WHERE hp.check_in_date = ? AND hp.check_out_date = ?';
        params.push(checkInDate, checkOutDate);
      }

      query += ' ORDER BY h.name, hp.recorded_at DESC';

      const results = await this.db.all(query, params);

      const comparison = new Map<string, any>();

      for (const row of results) {
        if (!comparison.has(row.id)) {
          comparison.set(row.id, {
            id: row.id,
            hotelId: row.hotel_id,
            name: row.name,
            latestPrice: row.price,
            currency: row.currency,
            lastUpdated: row.recorded_at,
          });
        }
      }

      return Array.from(comparison.values()).sort((a, b) => {
        if (a.latestPrice === null) return 1;
        if (b.latestPrice === null) return -1;
        return a.latestPrice - b.latestPrice;
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to compare prices: ${errorMsg}`);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log('Database connection closed');
    }
  }

  isInitialized(): boolean {
    return this.db !== null;
  }
}

export default Database;