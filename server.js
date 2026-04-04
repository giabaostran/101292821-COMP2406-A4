const path = require("path");
const pug = require("pug");
const fs = require("fs");
const express = require("express");

const app = express();
const PORT = 3000;

// Configure Express to handle PUG and point it to the PUG pages
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "pages"));

// Built-in middleware to parse JSON bodies
app.use(express.json());

// Serve static files (no need for manual serveStatic)
app.use("/scripts", express.static(path.join(__dirname, "scripts")));
app.use("/styles", express.static(path.join(__dirname, "styles")));
app.use("/images", express.static(path.join(__dirname, "images")));


// Load the streaming service data upon startup
let streamingServices = [];
// Get all the files in the streamingServices directory (assumed to be JSON)
const files = fs.readdirSync(path.join(__dirname, "streamingServices"));
// Read each .json file and extract/add the JSON data to the streamingServices array
for (let i=0; i<files.length; i++) {
    if (files[i].endsWith(".json")) {
        const data = fs.readFileSync(path.join(__dirname, "streamingServices", files[i]), "utf-8");
        streamingServices.push(JSON.parse(data));
    }
}

// Set up the order history which will have this format:
/* [ { 
      "fees": { "Cinema Time": 1.79, "Stream It": 1.49 }, "subtotal": 20.80, "tax": 3.49, "total": 24.29, "movies": { 
         "Cinema Time": [ { "id": 50, "title": "...", ... }, ..., { "id": 51, "title": "...", ... } ],
         "Stream It":   [ { "id": 1, "title": "...", ... }, { "id": 2, "title": "...", ... }, { "id": 3, "title": "...", ... } ] }},
     { 
      "fees": { "Cinema Time": 1.79, "Stream It": 1.49 }, "subtotal": 20.80, "tax": 3.49, "total": 24.29, "movies": { 
         "Cinema Time": [ { "id": 50, "title": "...", ... }, ..., { "id": 51, "title": "...", ... } ],
         "Stream It":   [ { "id": 1, "title": "...", ... }, { "id": 2, "title": "...", ... }, { "id": 3, "title": "...", ... } ] }},
     { 
      "fees": { "Cinema Time": 1.79, "Stream It": 1.49 }, "subtotal": 20.80, "tax": 3.49, "total": 24.29, "movies": { 
         "Cinema Time": [ { "id": 50, "title": "...", ... }, ..., { "id": 51, "title": "...", ... } ],
         "Stream It":   [ { "id": 1, "title": "...", ... }, { "id": 2, "title": "...", ... }, { "id": 3, "title": "...", ... } ] }},
     ...
   ] */
let orderHistory = []; 


// Function for counting the total movies ordered
function calcTotalMovies(serviceName) {
    let count = 0;

    for (const order of orderHistory) {
        const moviesForService = order.movies[serviceName];
        if (moviesForService)
            count += moviesForService.length;
    }
       
    return count;
}

// Function for calculating the total sales for a service (includes total fees and total prices)
function calcTotalSales(serviceName) {
    let total = 0;

    // Go through all the orders
    for (const order of orderHistory) {
        // Add the service fee to the total if this order had at least one movie from this service
        if (order.fees[serviceName])
            total += order.fees[serviceName];

        // Add the price of each movie from this service if the service array
        if (order.movies[serviceName]) {
            for (const movie of order.movies[serviceName])
                total += movie.price;
        }
    }
    return total;
}


// Function for finding the average order cost
function calcAvgOrder(serviceName) {
    let allOrdersTotal = 0;
    let validOrders = 0;
    for (const order of orderHistory) {
        if (!order.fees[serviceName]) continue; // Skip over orders that di not include this service

        let orderTotal = 0;

        // Add the service fee to the total if this order had at least one movie from this service
        if (order.fees[serviceName])
            orderTotal += order.fees[serviceName];

        // Add the price of each movie from this service if the service array
        if (order.movies[serviceName]) {
            for (const movie of order.movies[serviceName])
                orderTotal += movie.price;
        }
        
        allOrdersTotal += orderTotal;
        validOrders++;
    }
    if (validOrders === 0)
        return 0;
    return allOrdersTotal / validOrders;
}

// Function for finding the most popular movie
function findMostPopular(serviceName) {
    // Build up a histogram with movie ID's as keys and values being the number of times ordered
    let counts = {};
    for (const order of orderHistory) {
        if (order.movies[serviceName]) {
            for (const movie of order.movies[serviceName]) 
                counts[movie.id] = (counts[movie.id] || 0) + 1;
        }
    }

    // Get all movies
    const allMovies = Object.values(streamingServices.find(s => s.name === serviceName).genres).flat();

    // Find the one with the largest count
    let bestCount = -1;
    let bestMovieID = null;
    let bestMovieTitle = "";
    for (const movieID in counts) {
        if (counts[movieID] >= bestCount) {
            // Make sure the movie is still around before making it the best one because it is possible 
            // that the popular movie has been deleted from the movie service since it was ordered.
            const mov = allMovies.find(m => m.id === parseInt(movieID));
            if (mov) {
                bestCount = counts[movieID];
                bestMovieID = parseInt(movieID); 
                bestMovieTitle = mov.title;
            }
        }
    }
    // Return the title of the best movie
    return bestMovieTitle; 
}


// ---------------------------------
// Handle requests for the home page
// ---------------------------------
app.get("/", (req, res) => {
    res.render("index");
});


// ----------------------------------
// Handle requests for the order page
// ----------------------------------
app.get("/order", (req, res) => {
    let basicServiceData = [];
    streamingServices.forEach(s => 
        basicServiceData.push({
            "id": s.id,
            "name": s.name,
            "minOrder": s.minOrder,
            "serviceFee": s.serviceFee
        })
    );
    res.render("orderForm", { basicServiceData });
});


// ----------------------------------
// Handle requests for the stats page
// ----------------------------------
app.get("/stats", (req, res) => {
    // Form a JSON object with this format
    // { service1Name: { name: ..., totalOrdered: ..., totalSales: ..., avgCost: ..., mostPopular: ... }, 
    //   service2Name: { name: ..., totalOrdered: ..., totalSales: ..., avgCost: ..., mostPopular: ... }, 
    //   service3Name: { name: ..., totalOrdered: ..., totalSales: ..., avgCost: ..., mostPopular: ... } }

    // Go through the orderHistory and calculate the required information
    const statsData = { };

    for (const service of streamingServices) {
        statsData[service.name] = {
            name: service.name,
            totalOrdered: calcTotalMovies(service.name),
            totalSales: calcTotalSales(service.name),
            avgCost: calcAvgOrder(service.name),
            mostPopular: findMostPopular(service.name)
        }    
    }
    res.render("stats", { statsData });
});


// ----------------------------------------------------------
// Handle an API request for the streaming-services JSON data
// ----------------------------------------------------------
app.get("/services", (req, res) => {
    console.log("Request for services data");
    let basicServicesList = { "count": streamingServices.length, "services": [] };
    streamingServices.forEach(s => 
        basicServicesList.services.push({
            "id": s.id,
            "name": s.name
        })
    );
    // Examine the accept header
    const accept = req.headers.accept || "";

    // If the client wants JSON, send it. Otherwise render the services page
    if (accept.includes("application/json"))
        res.json(basicServicesList);
    else
        res.render("services", { services: basicServicesList.services });
});


// ---------------------------------------------------------------------------------------------
// Handle an order submission. Store the order in the history
// ---------------------------------------------------------------------------------------------
app.post("/submit-order", (req, res) => {
    try {
        // Get the order and add it to the order history
        const order = req.body;
        orderHistory.push(order);
        res.send("Order received");
    } catch (err) {
        console.error(err);
        res.status(400).send("Invalid order data");
    }
});


// ---------------------------------------------------------
// Handle an API request for a streaming-service's JSON data
// ---------------------------------------------------------
app.get("/services/:id", (req, res) => {
    console.log("Request for service " + req.params.id);
    const service = streamingServices.find(s => s.id === parseInt(req.params.id));
    if (!service) 
        return res.status(404).send("Service not found");

    // Examine the accept header
    const accept = req.headers.accept || "";

    // If the client wants JSON, send it. Otherwise render the serviceInfo page
    if (accept.includes("application/json")) 
        res.json(service);
    else 
        res.render("serviceInfo", { service });
});


// ---------------------------------------------------------------------------------
// Handle the updating of a service's Name, Service Fee or Minimum Order information
// ---------------------------------------------------------------------------------
app.put("/services/:sID/info", (req, res) => {
    console.log("Request for service info for service " + req.params.sID);
    const sID = parseInt(req.params.sID);
    const service = streamingServices.find(s => s.id === sID);

    // Make sure the service ID is valid
    if (!service) 
        return res.status(404).json({ error: "Service not found" });

    // Update just these three fields
    ["name", "minOrder", "serviceFee"].forEach(field => {
        if (req.body[field] !== undefined) 
            service[field] = req.body[field];
    });

    // Reply with the JSON response containing a success flag and the entire service data
    res.json({ success: true, service });
});


// ----------------------------------------------------------------
// Handle adding a movie to a service, which is passed in as a JSON 
//{ "genre": "Action", "movie": {
//        "title": "New Adventure",
//        "description": "Epic mission in outer space.",
//        "price": 5.99,
//        "year": 2025 }}
// ----------------------------------------------------------------
app.post("/services/:sID/movies", (req, res) => {
    console.log("Request for adding movie to " + req.params.sID);
    const sID = parseInt(req.params.sID);
    const service = streamingServices.find(s => s.id === sID);

    // Make sure the service ID is valid
    if (!service) 
        return res.status(404).json({ error: "Service not found" });

    // Get the genre and the movie from the body
    const { genre, movie } = req.body;

    // Handle the case where the genre or movie data is missing
    if (!genre || !movie) 
        return res.status(400).json({ error: "Genre and movie required" });

    // Handle the case where the genre is invalid
    if (!service.genres[genre]) 
        return res.status(400).json({ error: "Genre does not exist" });

    // Find a unique movie ID and set it for the movie object
    const allMovies = Object.values(service.genres).flat();
    const maxID = allMovies.reduce((max, m) => Math.max(max, m.id), 0);
    movie.id = maxID + 1;

    // Add the movie to the genre array
    service.genres[genre].push(movie);

    // Reply with the JSON response containing a success flag and the entire service data
    res.json({ success: true, service });
});


// --------------------------------------------------------------------------------------
// Handle adding a genre to a service, which is passed in as a JSON { "genre": "Sci-Fi" }
// --------------------------------------------------------------------------------------
app.post("/services/:sID/genres", (req, res) => {
    console.log("Request for adding genre to " + req.params.sID);
    const sID = parseInt(req.params.sID);
    const service = streamingServices.find(s => s.id === sID);

    // Make sure the service ID is valid
    if (!service) 
        return res.status(404).json({ error: "Service not found" });

    // Make sure the name is not empty
    const genreName = req.body.genre?.trim();
    if (!genreName) 
        return res.status(400).json({ error: "Genre name required" });

    // Make sure thet genre is not already there
    if (service.genres[genreName]) 
        return res.status(400).json({ error: "Genre already exists" });

    // Add the genre with an empty array of movies
    service.genres[genreName] = [];

    // Reply with the JSON response containing a success flag and the entire service data
    res.json({ success: true, service });
});


// -----------------------------------------------------
// Handle the deleting of a movie with the given movieID
// -----------------------------------------------------
app.delete("/services/:sID/movies/:movieID", (req, res) => {
    console.log("Request for deleting movie " + req.params.movieID + " from " + req.params.sID);
    const sID = parseInt(req.params.sID);
    const movieID = parseInt(req.params.movieID);

    // Make sure the service ID is valid
    const service = streamingServices.find(s => s.id === sID);
    if (!service) 
        return res.status(404).json({ error: "Service not found" });

    let deleted = false;

    // Go through each genre to find the movie
    for (const genre in service.genres) {
        // Go through the movies in the array for that genre and keep all that do not have this movie ID
        const originalLength = service.genres[genre].length;
        service.genres[genre] = service.genres[genre].filter(m => m.id !== movieID);

        // If a movie was removed, it must have matched that ID, flag as having been deleted
        if (service.genres[genre].length < originalLength) 
            deleted = true;
    }

    // If the movie ID was not found, return an error
    if (!deleted) 
        return res.status(404).json({ error: "Movie not found" });

    // Reply with the JSON response containing a success flag and the entire service data
    res.json({ success: true, service });
});


// ---------------------------------------------------
// Handle the deleting of a service with the given sID
// ---------------------------------------------------
app.delete("/services/:sID", (req, res) => {
    console.log("Request for deleting service " + req.params.sID);
    const sID = parseInt(req.params.sID);

    // Make sure the service ID is valid
    const service = streamingServices.find(s => s.id === sID);
    if (!service) 
        return res.status(404).json({ error: "Service not found" });

    // Remove the service now
    streamingServices = streamingServices.filter(service => service.id !== sID);

    // Reply with the JSON response containing a success flag
    res.json({ success: true });
});


// ----------------------------------
// Handle the adding of a new service
// ----------------------------------
app.post("/services", (req, res) => {
    console.log("Request adding a service " + req.body.name);

    // Make sure that a name was provided
    const { name } = req.body;
    if (!name) 
        return res.status(400).json({ error: "Service name required" });

    // Find the max existing ID
    const maxId = streamingServices.length 
        ? Math.max(...streamingServices.map(s => s.id)) 
        : 0;

    // Create a new service object
    const newService = {
        id: maxId + 1,
        name,
        minOrder: 0,
        serviceFee: 0,
        genres: {}
    };

    // Add the streaming service
    streamingServices.push(newService);

    // Reply with the JSON response containing a success flag and the new service data
    res.json({ success: true, service: newService });
});

// --------------------------------
// Handle anything else as an error
// --------------------------------
app.use((req, res) => {
    res.status(404).send("Not Found");
});

// Start server
app.listen(PORT);
console.log(`"Weekend Movie" Planner Server running on http://localhost:${PORT}`);
