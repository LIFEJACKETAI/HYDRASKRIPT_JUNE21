# HydraSkript Backend

AI-Powered Book-Writing Platform Backend

## Features

- **AI Story Generation**: Generate full books and chapters with narrative continuity
- **Story Bible Integration**: Maintain character consistency and lore across generations
- **Credit System**: Pay-per-use model for AI generation
- **Queue Management**: Redis-based task processing with real-time updates
- **Audiobook Generation**: Convert books to audio format
- **Cover Art Generation**: AI-generated book covers
- **WebSocket Real-time Updates**: Live progress tracking
- **Stripe Integration**: Secure payment processing

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: Redis for task processing
- **AI**: OpenAI GPT-4 for text generation
- **Storage**: Cloudflare R2 / AWS S3 (configurable)
- **Payments**: Stripe
- **Real-time**: WebSocket for live updates

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile

### Generation
- `POST /api/generate/book` - Generate full book
- `POST /api/generate/chapter` - Generate chapter
- `POST /api/generate/style` - Train writing style

### Queue Management
- `GET /api/queue/status/:taskId` - Get task status
- `GET /api/queue/active` - Get active tasks
- `GET /api/queue/history` - Get task history
- `POST /api/queue/cancel/:taskId` - Cancel task

### Credits
- `GET /api/credits/balance` - Get credit balance
- `POST /api/credits/purchase` - Purchase credits
- `GET /api/credits/tiers` - Get subscription tiers
- `POST /api/credits/upgrade` - Upgrade subscription

### Media
- `POST /api/media/audiobook` - Generate audiobook
- `POST /api/media/cover-art` - Generate cover art
- `GET /api/media/download/:bookId/:type` - Download book

## WebSocket Events

Connect to WebSocket for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'your-jwt-token'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### Event Types
- `generation_update` - Progress updates for generation tasks
- `generation_completed` - Task completion notification
- `generation_failed` - Task failure notification

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret key for JWT tokens |
| `OPENAI_API_KEY` | OpenAI API key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `FAL_AI_API_KEY` | FAL.ai API key for image generation |
| `STORAGE_ENDPOINT` | Cloud storage endpoint |
| `PORT` | Server port (default: 3001) |

## Development

### Database Commands
```bash
npm run db:generate      # Generate Prisma client
npm run db:push         # Push schema changes
npm run db:migrate      # Create migration
npm run db:studio       # Open Prisma Studio
```

### Build & Run
```bash
npm run build           # Build TypeScript
npm start               # Start production server
npm run dev             # Start development server
```

## License

MIT License - see LICENSE file for details