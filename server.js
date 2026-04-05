const path = require("path");
const express = require("express");
const session = require("express-session");
const db = require("./db"); // this library contains methods for interacting with database

const app = express();
const PORT = 3000;
app.use(
  session({
    secret: "diddy-chan",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }),
);
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "pages"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/scripts", express.static(path.join(__dirname, "scripts")));
app.use("/styles", express.static(path.join(__dirname, "styles")));
app.use("/images", express.static(path.join(__dirname, "images")));

// Connect to a database
db.connectToDatabase().catch(console.error);

// ------------------------------------------------------------------
// Stats Helper Functions (Modified to accept arrays as parameters)
// ------------------------------------------------------------------
function calcTotalMovies(serviceName, orderHistory) {
  let count = 0;
  for (const order of orderHistory) {
    const moviesForService = order.movies[serviceName];
    if (moviesForService) count += moviesForService.length;
  }
  return count;
}

function calcTotalSales(serviceName, orderHistory) {
  let total = 0;
  for (const order of orderHistory) {
    if (order.fees[serviceName]) total += order.fees[serviceName];
    if (order.movies[serviceName]) {
      for (const movie of order.movies[serviceName]) total += movie.price;
    }
  }
  return total;
}

function calcAvgOrder(serviceName, orderHistory) {
  let allOrdersTotal = 0;
  let validOrders = 0;
  for (const order of orderHistory) {
    if (!order.fees[serviceName]) continue;
    let orderTotal = 0;
    if (order.fees[serviceName]) orderTotal += order.fees[serviceName];
    if (order.movies[serviceName]) {
      for (const movie of order.movies[serviceName]) orderTotal += movie.price;
    }
    allOrdersTotal += orderTotal;
    validOrders++;
  }
  return validOrders === 0 ? 0 : allOrdersTotal / validOrders;
}

function findMostPopular(serviceName, orderHistory, streamingServices) {
  let counts = {};
  for (const order of orderHistory) {
    if (order.movies[serviceName]) {
      for (const movie of order.movies[serviceName])
        counts[movie.id] = (counts[movie.id] || 0) + 1;
    }
  }

  const service = streamingServices.find((s) => s.name === serviceName);
  if (!service) return "";

  const allMovies = Object.values(service.genres).flat();
  let bestCount = -1;
  let bestMovieTitle = "";

  for (const movieID in counts) {
    if (counts[movieID] >= bestCount) {
      const mov = allMovies.find((m) => m.id === parseInt(movieID));
      if (mov) {
        bestCount = counts[movieID];
        bestMovieTitle = mov.title;
      }
    }
  }
  return bestMovieTitle;
}

// ---------------------------------
// Routes (Now using async/await)
// ---------------------------------
app.get("/", (req, res) => {
  res.render("index", { user: req.session.user });
});

app.get("/order", async (req, res) => {
  // Only allow logged in users
  if (!req.session.user) return res.redirect("/login");

  try {
    const streamingServices = await db.getServices();

    let basicServiceData = streamingServices.map((s) => ({
      id: s.id,
      name: s.name,
      minOrder: s.minOrder,
      serviceFee: s.serviceFee,
    }));

    res.render("orderForm", { basicServiceData, user: req.session.user });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get("/stats", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    // Fetch EVERYTHING from the orders collection
    const orderHistory = await db.getOrders();
    const streamingServices = await db.getServices();
    const statsData = {};
    // Map through services using the data fetched from MongoDB
    for (const service of streamingServices) {
      statsData[service.name] = {
        name: service.name,
        totalOrdered: calcTotalMovies(service.name, orderHistory),
        totalSales: calcTotalSales(service.name, orderHistory),
        avgCost: calcAvgOrder(service.name, orderHistory),
        mostPopular: findMostPopular(
          service.name,
          orderHistory,
          streamingServices,
        ),
      };
    }

    res.render("stats", { statsData, user: req.session.user });
  } catch (err) {
    res.status(500).send("Error calculating statistics");
  }
});

app.get("/services", async (req, res) => {
  // Admin check
  if (!req.session.user || !req.session.user.admin) {
    return res.status(403).send("Unauthorized: Admins only.");
  }

  try {
    const streamingServices = await db.getServices();
    let services = streamingServices.map((s) => ({ id: s.id, name: s.name }));
    res.render("services", { services, user: req.session.user });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post("/submit-order", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const newOrder = {
      userId: req.session.user.id,
      username: req.session.user.username,
      fees: req.body.fees,
      subtotal: req.body.subtotal,
      tax: req.body.tax,
      total: req.body.total,
      movies: req.body.movies,
      orderDate: new Date(),
    };

    await db.addOrder(newOrder); // Migrated
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save order." });
  }
});

app.get("/services/:id", async (req, res) => {
  if (!req.session.user) {
    return res.status(403).send("Unauthorized");
  }

  try {
    const service = await db.getServiceById(parseInt(req.params.id));

    if (!service) {
      return res.status(404).send("Service not found.");
    }

    const acceptHeader = req.headers.accept || "";

    if (acceptHeader.includes("application/json")) {
      return res.json(service);
    }

    res.render("serviceInfo", { service, user: req.session.user });
  } catch (err) {
    console.error("GET /services/:id error:", err);
    res.status(500).send("Failed to fetch service.");
  }
});

app.put("/services/:sID/info", async (req, res) => {
  console.log("Request for service info for service " + req.params.sID);
  try {
    const sID = parseInt(req.params.sID);
    const service = await db.getServiceById(sID);

    if (!service) return res.status(404).json({ error: "Service not found" });

    ["name", "minOrder", "serviceFee"].forEach((field) => {
      if (req.body[field] !== undefined) service[field] = req.body[field];
    });

    await db.updateService(sID, service);
    res.json({ success: true, service });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/services/:sID/movies", async (req, res) => {
  console.log("Request for adding movie to " + req.params.sID);
  try {
    const sID = parseInt(req.params.sID);
    const service = await db.getServiceById(sID);

    if (!service) return res.status(404).json({ error: "Service not found" });

    const { genre, movie } = req.body;
    if (!genre || !movie)
      return res.status(400).json({ error: "Genre and movie required" });
    if (!service.genres[genre])
      return res.status(400).json({ error: "Genre does not exist" });

    const allMovies = Object.values(service.genres).flat();
    const maxID = allMovies.reduce((max, m) => Math.max(max, m.id), 0);
    movie.id = maxID + 1;

    service.genres[genre].push(movie);
    await db.updateService(sID, service);

    res.json({ success: true, service });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/services/:sID/genres", async (req, res) => {
  console.log("Request for adding genre to " + req.params.sID);
  try {
    const sID = parseInt(req.params.sID);
    const service = await db.getServiceById(sID);

    if (!service) return res.status(404).json({ error: "Service not found" });

    const genreName = req.body.genre?.trim();
    if (!genreName)
      return res.status(400).json({ error: "Genre name required" });
    if (service.genres[genreName])
      return res.status(400).json({ error: "Genre already exists" });

    service.genres[genreName] = [];
    await db.updateService(sID, service);

    res.json({ success: true, service });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/services/:sID/movies/:movieID", async (req, res) => {
  console.log(
    "Request for deleting movie " +
      req.params.movieID +
      " from " +
      req.params.sID,
  );
  try {
    const sID = parseInt(req.params.sID);
    const movieID = parseInt(req.params.movieID);
    const service = await db.getServiceById(sID);

    if (!service) return res.status(404).json({ error: "Service not found" });

    let deleted = false;
    for (const genre in service.genres) {
      const originalLength = service.genres[genre].length;
      service.genres[genre] = service.genres[genre].filter(
        (m) => m.id !== movieID,
      );
      if (service.genres[genre].length < originalLength) deleted = true;
    }

    if (!deleted) return res.status(404).json({ error: "Movie not found" });

    await db.updateService(sID, service);
    res.json({ success: true, service });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/services/:sID", async (req, res) => {
  console.log("Request for deleting service " + req.params.sID);
  try {
    const sID = parseInt(req.params.sID);
    const service = await db.getServiceById(sID);

    if (!service) return res.status(404).json({ error: "Service not found" });

    await db.deleteServiceById(sID);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/services", async (req, res) => {
  console.log("Request adding a service " + req.body.name);
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Service name required" });

    const streamingServices = await db.getServices();
    const maxId = streamingServices.length
      ? Math.max(...streamingServices.map((s) => s.id))
      : 0;

    const newService = {
      id: maxId + 1,
      name,
      minOrder: 0,
      serviceFee: 0,
      genres: {},
    };

    await db.addService(newService);
    res.json({ success: true, service: newService });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// GET Login Page
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login", { user: req.session.user });
});

// POST Login Action
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.getUserByCredentials(username, password); // Migrated

    if (user) {
      req.session.user = {
        id: user._id,
        username: user.username,
        admin: user.admin,
      };
      res.redirect("/");
    } else {
      res.render("login", { error: "Invalid credentials", user: null });
    }
  } catch (err) {
    res.status(500).send("Login error");
  }
});

// GET Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("register", { user: req.session.user });
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await db.findUserByUsername(username); // Migrated
    if (existingUser)
      return res.render("register", { error: "Taken", user: null });

    const newUser = { username, password, admin: false, privacy: false };
    const result = await db.addUser(newUser); // Migrated

    req.session.user = {
      id: result.insertedId,
      username: newUser.username,
      admin: false,
    };
    res.redirect("/");
  } catch (err) {
    res.status(500).send("Registration error");
  }
});

app.get("/users", async (req, res) => {
  if (!req.session.user) return res.status(403).send("Unauthorized");
  try {
    const allUsers = await db.getAllUsers();

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      const userData = allUsers.map((u) => ({
        id: u._id,
        username: u.username,
        privacy: u.privacy,
      }));
      return res.json(userData);
    }

    res.render("users", {
      users: allUsers,
      user: req.session.user,
    });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.delete("/users/:uID", async (req, res) => {
  if (!req.session.user) return res.status(403).json({ error: "Unauthorized" });
  try {
    const result = await db.deleteUserById(req.params.uID);

    if (result.deletedCount === 1) {
      if (req.session.user.id === req.params.uID) {
        req.session.destroy();
        res.redirect("/login");
      }
      res.send("User has been deleted");
    } else {
      console.log("What");
      res.status(404).json({ error: "User not found." });
    }
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// GET User Profile
app.get("/users/:uID", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    const targetUser = await db.getUserById(req.params.uID);

    if (!targetUser) {
      return res.status(404).send("User not found");
    }

    // Logic: Allow if Public OR if current user is the owner OR if current user is Admin
    const isOwner = req.session.user.id.toString() === req.params.uID;
    const isAdmin = req.session.user.admin;

    if (targetUser.privacy && !isOwner && !isAdmin) {
      return res.status(403).send("This profile is private.");
    }

    // Fetch orders where userId matches the profile being viewed
    const userOrders = await db.getOdersByUserId(req.params.uID);
    console.log(userOrders);
    res.render("userProfile", {
      targetUser,
      orders: userOrders,
      user: req.session.user, // Required for header.pug
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error loading profile.");
  }
});
// ========================================================================================== MIGRATE DB
// PUT Update User
app.put("/users/:uID", async (req, res) => {
  if (!req.session.user) return res.status(403).json({ error: "Unauthorized" });

  try {
    const { username, password, privacy } = req.body;
    const mongoDb = await db.connectToDatabase();

    await mongoDb
      .collection("users")
      .updateOne(
        { _id: new ObjectId(req.params.uID) },
        { $set: { username, password, privacy } },
      );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update database." });
  }
});

app.use((req, res) => {
  res.status(404).send("Not Found");
});

app.listen(PORT, () => {
  console.log(
    `"Weekend Movie" Planner Server running on http://localhost:${PORT}`,
  );
});
