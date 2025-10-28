# vnet-ip-track

A subnet planning and tracking tool with a simple backend for saving changes, thoughts, and recommendations.

## Components

- **Subnet Maker** - Interactive subnet calculator and planner
- **Backend API** - REST API for saving and managing planning notes

## Backend

The backend provides a simple REST API to store and retrieve notes about your subnet planning work.

See [backend/README.md](backend/README.md) for full API documentation.

### Quick Start

```bash
cd backend
npm install
npm start
```

The API will be available at `http://localhost:3000`