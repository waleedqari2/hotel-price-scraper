# 🏨 Hotel Price Scraper

A comprehensive TypeScript-based web scraper for tracking hotel prices from WebBeds. This project scrapes real-time hotel pricing data, stores it in SQLite, and provides a RESTful API for searching, comparing, and monitoring hotel prices.

## 📋 Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Technologies](#technologies)
- [Contributing](#contributing)
- [License](#license)

## ✨ Features

### Core Features
- ✅ **Real-time Price Scraping** - Scrapes hotel prices from WebBeds using Puppeteer
- ✅ **Multiple Hotel Support** - Search and monitor 9 predefined Makkah hotels
- ✅ **Price History Tracking** - Maintains complete price history with timestamps
- ✅ **Price Comparison** - Compare prices across multiple hotels
- ✅ **SQLite Database** - Lightweight persistent storage
- ✅ **RESTful API** - Complete API for all operations
- ✅ **Error Handling** - Comprehensive error handling with retry logic
- ✅ **TypeScript** - Full type safety and better developer experience

### Advanced Features
- 🔄 **Retry Mechanism** - Exponential backoff for failed requests
- 📊 **Data Persistence** - Automatic price history recording
- 🔍 **Flexible Search** - Search by hotel name or get all predefined hotels
- ⚙️ **Configurable** - Environment-based configuration
- 📝 **Logging** - Structured logging for debugging
- 🛡️ **CORS Support** - Ready for frontend integration

## 📦 Prerequisites

- **Node.js** >= 16.0.0
- **npm** or **yarn**
- Chrome/Chromium (for Puppeteer)

## 🚀 Installation

### 1. Clone the repository
```bash
git clone https://github.com/waleedqari2/hotel-price-scraper.git
cd hotel-price-scraper
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup environment variables
```bash
cp .env.example .env
```

### 4. Build the project
```bash
npm run build
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=localhost

# Database Configuration
DATABASE_PATH=./hotels.db

# WebBeds Scraper Configuration
WEBBEDS_BASE_URL=https://www.webbeds.com
SCRAPER_TIMEOUT=30000
SCRAPER_HEADLESS=true
SCRAPER_RETRIES=3

# Logging
LOG_LEVEL=info

# API Configuration
CORS_ORIGIN=*
API_PREFIX=/api

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | Environment (development, production) |
| PORT | 3000 | Server port |
| HOST | localhost | Server host |
| DATABASE_PATH | ./hotels.db | SQLite database path |
| WEBBEDS_BASE_URL | https://www.webbeds.com | WebBeds URL |
| SCRAPER_TIMEOUT | 30000 | Scraper timeout in ms |
| SCRAPER_HEADLESS | true | Run Puppeteer in headless mode |
| SCRAPER_RETRIES | 3 | Number of retry attempts |
| LOG_LEVEL | info | Logging level |
| CORS_ORIGIN | * | CORS allowed origin |
| API_PREFIX | /api | API endpoint prefix |

## 📖 Usage

### Development

Run the server in development mode with hot-reload:

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### Production

Build and run in production mode:

```bash
npm run build
npm start
```

### Check Health

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "success": true,
  "status": 200,
  "message": "Server is running",
  "timestamp": "2024-12-25T00:00:00.000Z",
  "environment": "development"
}
```

## 📡 API Endpoints

### 1. Search Hotels

**POST** `/api/hotels/search`

Search for hotel prices.

Request Body:
```json
{
  "hotelName": "M Hotel Al Dana Makkah",
  "checkInDate": "2024-12-25",
  "checkOutDate": "2024-12-26",
  "guests": 2
}
```

Response:
```json
{
  "success": true,
  "message": "Found 1 hotel(s)",
  "data": [
    {
      "hotelId": "2490015",
      "name": "M Hotel Al Dana Makkah by Millennium",
      "price": 250.00,
      "currency": "USD",
      "checkIn": "2024-12-25",
      "checkOut": "2024-12-26"
    }
  ]
}
```

### 2. Get All Hotels

**GET** `/api/hotels`

Get list of all hotels in the database.

Response:
```json
{
  "success": true,
  "message": "Found 9 hotel(s)",
  "data": [
    {
      "id": "hotel_1703500000000",
      "hotelId": "2490015",
      "name": "M Hotel Al Dana Makkah by Millennium",
      "createdAt": "2024-12-25T12:00:00Z",
      "updatedAt": "2024-12-25T12:00:00Z"
    }
  ]
}
```

### 3. Add Hotel

**POST** `/api/hotels`

Add a new hotel to track.

Request Body:
```json
{
  "name": "New Hotel Name",
  "hotelId": "123456"
}
```

Response:
```json
{
  "success": true,
  "message": "Hotel added successfully",
  "data": {
    "id": "hotel_1703500000000",
    "hotelId": "123456",
    "name": "New Hotel Name",
    "createdAt": "2024-12-25T12:00:00Z",
    "updatedAt": "2024-12-25T12:00:00Z"
  }
}
```

### 4. Get Hotel Details

**GET** `/api/hotels/:id`

Get specific hotel details with recent price history.

Response:
```json
{
  "success": true,
  "data": {
    "id": "hotel_1703500000000",
    "hotelId": "2490015",
    "name": "M Hotel Al Dana Makkah by Millennium",
    "createdAt": "2024-12-25T12:00:00Z",
    "updatedAt": "2024-12-25T12:00:00Z",
    "priceHistory": [
      {
        "id": "price_1703500000000",
        "hotelId": "2490015",
        "price": 250.00,
        "currency": "USD",
        "checkInDate": "2024-12-25",
        "checkOutDate": "2024-12-26",
        "recordedAt": "2024-12-25T12:00:00Z"
      }
    ]
  }
}
```

### 5. Scrape Specific Hotel

**POST** `/api/hotels/:id/scrape`

Scrape prices for a specific hotel.

Request Body:
```json
{
  "checkInDate": "2024-12-25",
  "checkOutDate": "2024-12-26",
  "guests": 2
}
```

### 6. Delete Hotel

**DELETE** `/api/hotels/:id`

Delete a hotel from tracking.

### 7. Get Price History

**GET** `/api/hotels/:id/history?limit=30`

Get price history for a specific hotel with pagination support.

### 8. Compare Prices

**GET** `/api/hotels/compare?checkInDate=2024-12-25&checkOutDate=2024-12-26`

Compare prices across all hotels for specific dates.

### 9. Get Predefined Hotels

**GET** `/api/hotels/predefined`

Get list of predefined Makkah hotels.

## 📁 Project Structure

```
hotel-price-scraper/
├── src/
│   └── server/
│       ├── index.ts              # Main server entry point
│       ├── config.ts             # Configuration management
│       ├── database.ts           # SQLite database layer
│       ├── routes/
│       │   └── hotels.ts         # Hotel API routes
│       ├── services/
│       │   └── webbeds-scraper.ts # WebBeds scraping service
│       └── utils/
│           └── logger.ts         # Logging utility
├── dist/                         # Compiled output
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## 🛠️ Technologies

### Core Technologies
- **TypeScript** - Type-safe JavaScript
- **Express.js** - Web framework
- **Node.js** - Runtime environment

### Scraping & Data
- **Puppeteer** - Browser automation
- **Cheerio** - HTML parsing
- **SQLite** - Database
- **sqlite3** - Database driver

### Development Tools
- **ts-node** - TypeScript execution
- **nodemon** - Auto-reload on file changes
- **ESLint** - Code linting

### Utilities
- **uuid** - ID generation
- **dotenv** - Environment variable management
- **cors** - CORS middleware
- **morgan** - HTTP request logging
- **axios** - HTTP client

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support, please open an issue on GitHub.

## 🎯 Future Enhancements

- [ ] WebSocket support for real-time price updates
- [ ] Multi-site scraping (Booking.com, Agoda, etc.)
- [ ] Advanced price prediction
- [ ] Email notifications for price drops
- [ ] Dashboard UI
- [ ] Authentication system
- [ ] Rate limiting
- [ ] Caching layer
- [ ] API documentation (Swagger)

---

Made with ❤️ by [@waleedqari2](https://github.com/waleedqari2)