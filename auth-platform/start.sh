#!/bin/bash

echo "Starting Auth Platform..."

# Kill any existing processes
pkill -f "node src/index.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# Start backend
echo "Starting backend on port 3001..."
cd backend
npm run dev &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting frontend on port 5173..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "==================================="
echo "Auth Platform is running!"
echo "==================================="
echo ""
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:3001"
echo ""
echo "Demo Credentials:"
echo "  Email: alice@example.com (or bob, charlie, admin)"
echo "  Password: demo123"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for processes
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
