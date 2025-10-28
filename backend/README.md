# VNet IP Track - Backend API

A simple Node.js/Express backend for saving and managing subnet planning notes, including changes, thoughts, and recommendations.

## Features

- RESTful API for managing notes
- Three categories: Changes, Thoughts, Recommendations
- JSON file-based storage (lightweight, no database required)
- CORS enabled for frontend integration
- Simple CRUD operations

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:3000` by default.

## API Endpoints

### Get All Notes
```
GET /api/notes
```
Returns all notes (changes, thoughts, and recommendations).

**Response:**
```json
{
  "changes": [...],
  "thoughts": [...],
  "recommendations": [...]
}
```

### Get Notes by Type
```
GET /api/notes/:type
```
Where `:type` can be `changes`, `thoughts`, or `recommendations`.

**Response:**
```json
[
  {
    "id": "1234567890",
    "title": "Example Note",
    "content": "Note content here",
    "tags": ["subnet", "planning"],
    "createdAt": "2025-10-28T12:00:00.000Z",
    "updatedAt": "2025-10-28T12:00:00.000Z"
  }
]
```

### Add a New Note
```
POST /api/notes/:type
```

**Request Body:**
```json
{
  "title": "Optional title",
  "content": "Your note content (required)",
  "tags": ["optional", "tags"]
}
```

**Response:**
```json
{
  "id": "1234567890",
  "title": "Optional title",
  "content": "Your note content",
  "tags": ["optional", "tags"],
  "createdAt": "2025-10-28T12:00:00.000Z",
  "updatedAt": "2025-10-28T12:00:00.000Z"
}
```

### Update a Note
```
PUT /api/notes/:type/:id
```

**Request Body:**
```json
{
  "title": "Updated title",
  "content": "Updated content",
  "tags": ["updated", "tags"]
}
```

**Response:** Updated note object

### Delete a Note
```
DELETE /api/notes/:type/:id
```

**Response:**
```json
{
  "message": "Note deleted successfully",
  "note": {...}
}
```

### Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-28T12:00:00.000Z"
}
```

## Data Storage

Notes are stored in `backend/data/notes.json` (automatically created on first run).

## Usage Examples

### Using curl

**Add a change note:**
```bash
curl -X POST http://localhost:3000/api/notes/changes \
  -H "Content-Type: application/json" \
  -d '{"title":"Subnet Update","content":"Changed 10.0.1.0/24 to 10.0.1.0/25","tags":["subnet","modification"]}'
```

**Get all thoughts:**
```bash
curl http://localhost:3000/api/notes/thoughts
```

**Update a note:**
```bash
curl -X PUT http://localhost:3000/api/notes/recommendations/1234567890 \
  -H "Content-Type: application/json" \
  -d '{"content":"Updated recommendation content"}'
```

**Delete a note:**
```bash
curl -X DELETE http://localhost:3000/api/notes/changes/1234567890
```

### Using JavaScript (fetch)

```javascript
// Add a new thought
fetch('http://localhost:3000/api/notes/thoughts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Network Planning',
    content: 'Consider using /26 subnets for better segmentation',
    tags: ['planning', 'optimization']
  })
})
.then(res => res.json())
.then(data => console.log(data));

// Get all notes
fetch('http://localhost:3000/api/notes')
  .then(res => res.json())
  .then(data => console.log(data));
```

## Environment Variables

- `PORT` - Server port (default: 3000)

## License

ISC
