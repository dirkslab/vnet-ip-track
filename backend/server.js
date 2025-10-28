const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'notes.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Initialize data file if it doesn't exist
async function initDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    const initialData = {
      changes: [],
      thoughts: [],
      recommendations: []
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

// Read data from file
async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data:', error);
    return { changes: [], thoughts: [], recommendations: [] };
  }
}

// Write data to file
async function writeData(data) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing data:', error);
    return false;
  }
}

// Routes

// Get all notes
app.get('/api/notes', async (req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve notes' });
  }
});

// Get notes by type (changes, thoughts, recommendations)
app.get('/api/notes/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!['changes', 'thoughts', 'recommendations'].includes(type)) {
      return res.status(400).json({ error: 'Invalid note type' });
    }

    const data = await readData();
    res.json(data[type] || []);
  } catch (error) {
    res.status(500).json({ error: `Failed to retrieve ${req.params.type}` });
  }
});

// Add a new note
app.post('/api/notes/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!['changes', 'thoughts', 'recommendations'].includes(type)) {
      return res.status(400).json({ error: 'Invalid note type' });
    }

    const { title, content, tags } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const data = await readData();
    const newNote = {
      id: Date.now().toString(),
      title: title || '',
      content,
      tags: tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data[type].push(newNote);
    await writeData(data);

    res.status(201).json(newNote);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Update a note
app.put('/api/notes/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!['changes', 'thoughts', 'recommendations'].includes(type)) {
      return res.status(400).json({ error: 'Invalid note type' });
    }

    const { title, content, tags } = req.body;
    const data = await readData();
    const noteIndex = data[type].findIndex(note => note.id === id);

    if (noteIndex === -1) {
      return res.status(404).json({ error: 'Note not found' });
    }

    data[type][noteIndex] = {
      ...data[type][noteIndex],
      title: title !== undefined ? title : data[type][noteIndex].title,
      content: content !== undefined ? content : data[type][noteIndex].content,
      tags: tags !== undefined ? tags : data[type][noteIndex].tags,
      updatedAt: new Date().toISOString()
    };

    await writeData(data);
    res.json(data[type][noteIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete a note
app.delete('/api/notes/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!['changes', 'thoughts', 'recommendations'].includes(type)) {
      return res.status(400).json({ error: 'Invalid note type' });
    }

    const data = await readData();
    const noteIndex = data[type].findIndex(note => note.id === id);

    if (noteIndex === -1) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const deletedNote = data[type].splice(noteIndex, 1)[0];
    await writeData(data);

    res.json({ message: 'Note deleted successfully', note: deletedNote });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize and start server
async function startServer() {
  await ensureDataDir();
  await initDataFile();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api/notes`);
  });
}

startServer();
