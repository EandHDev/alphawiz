require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const connectDB = require("./config/db");

const sessionRoutes = require("./routes/sessionRoutes");
const initSocket = require("./socket");

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// REST routes
app.use("/api/sessions", sessionRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ message: "AlphaWiz API is running" });
});

// Socket.io
initSocket(server);

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
