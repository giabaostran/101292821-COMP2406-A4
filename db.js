const { MongoClient, ObjectId } = require("mongodb");

const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);
let db;

async function connectToDatabase() {
  if (!db) {
    await client.connect();
    db = client.db("mwp");
    console.log("Connected to MongoDB database 'mwp'");
  }
  return db;
}

// --- Service Operations ---
async function getServices() {
  const db = await connectToDatabase();
  return await db.collection("services").find().toArray();
}

async function getServiceById(id) {
  const db = await connectToDatabase();
  return await db.collection("services").findOne({ id: id });
}

async function updateService(id, updatedService) {
  const db = await connectToDatabase();
  await db.collection("services").replaceOne({ id: id }, updatedService);
  return updatedService;
}

async function addService(newService) {
  const db = await connectToDatabase();
  await db.collection("services").insertOne(newService);
  return newService;
}

async function deleteServiceById(id) {
  const db = await connectToDatabase();
  await db.collection("services").deleteOne({ id: id });
}

// --- Order Operations ---
async function addOrder(orderData) {
  const db = await connectToDatabase();
  return await db.collection("orders").insertOne(orderData);
}

async function getOrders() {
  const db = await connectToDatabase();
  return await db.collection("orders").find({}).toArray();
}

// --- User Operations ---
async function addUser(newUser) {
  const db = await connectToDatabase();
  return await db.collection("users").insertOne(newUser);
}

async function getAllUsers() {
  const db = await connectToDatabase();
  return await db.collection("users").find({}).toArray();
}

async function getUserByCredentials(username, password) {
  const db = await connectToDatabase();
  return await db.collection("users").findOne({ username, password });
}

async function findUserByUsername(username) {
  const db = await connectToDatabase();
  return await db.collection("users").findOne({ username });
}

async function deleteUserById(uID) {
  const db = await connectToDatabase();
  return await db.collection("users").deleteOne({ _id: new ObjectId(uID) });
}

module.exports = {
  connectToDatabase,
  getServices,
  getServiceById,
  updateService,
  addService,
  deleteServiceById,
  addOrder,
  getOrders,
  addUser,
  getAllUsers,
  getUserByCredentials,
  findUserByUsername,
  deleteUserById,
};
