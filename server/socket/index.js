const { Server } = require("socket.io");
const gameHandler = require("./gameHandler");

module.exports = function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: ["http://localhost:5173", "https://eandHdev.github.io"],
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    gameHandler(io, socket);

    socket.on("disconnect", () => {
      console.log(`Player disconnected: ${socket.id}`);
    });
  });

  return io;
};
