const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require('stripe')(process.env.PAYMENT_KEY);

const app = express();
const port = process.env.PORT || 2100;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster21.x54inhf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster21`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const parcelCollection = client.db("profastDB").collection("parcels");
    const paymentsCollection = client.db("profastDB").collection("payments");

    // 🌐 GET: All parcels
    app.get("/parcels", async (req, res) => {
      try {
        const { email } = req.query;

    // Build filter conditionally
    const filter = email ? { create_by: email } : {};
//  const options = {
// sort : {createdAt : -1}
// }
    // Fetch and sort
    const parcels = await parcelCollection
      .find(filter)
      .sort({ createdAt: -1 }) // descending order (latest first)
      .toArray();

    res.status(200).send(parcels);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch parcels", error });
  }
    });

    //get one parcel
    app.get("/parcels/:id", async (req, res) => {
      try {
        const query = {_id : new ObjectId(req.params.id)}
        const parcels = await parcelCollection.findOne(query);
        res.status(200).send(parcels);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch parcels", error });
      }
    });

    // create parcel
    app.post("/parcels", async (req, res) => {
      try {
        const parcel = req.body;
        const result = await parcelCollection.insertOne(parcel);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to add parcel", error });
      }
    });

    //delete 
    app.delete('/parcels/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Convert string to ObjectId
    const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Parcel not found" });
    }

    res.status(200).send( result);
//     res.status(200).send({
//   message: "Parcel deleted successfully",
//   result: result
// });

  } catch (error) {
    res.status(500).send({ message: "Failed to delete parcel", error });
  }
});

//stripe
// ✅ GET /payments?email=user@example.com
app.get("/payments", async (req, res) => {
  try {
    const { email } = req.query;
    const filter = email ? { userEmail: email } : {};

    const history = await paymentsCollection
      .find(filter)
      .sort({ paidAt: -1 }) // latest first
      .toArray();

    res.status(200).send(history);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch payment history", error });
  }
});

// ✅ POST /payment after succeed
app.post("/payments", async (req, res) => {
  try {
    const { parcel_id, userEmail, transactionId, amount, paymentMethod } = req.body;

    if (!parcel_id || !userEmail || !transactionId || !amount) {
      return res.status(400).send({ message: "Missing required fields" });
    }

    // ✅ Update parcel payment_status
    const updateParcel = await parcelCollection.updateOne(
      { _id: new ObjectId(parcel_id) },
      { $set: { payment_status: "paid" } }
    );

    // ✅ Insert into payment history
    const paymentEntry = {
      parcel_id,
      userEmail,
      transactionId,
      paymentMethod,
      amount,
      paid_at_string : new Date().toISOString(),
      paid_at: new Date(), // store timestamp
    };

    const insertPayment = await paymentsCollection.insertOne(paymentEntry);

    res.status(200).send({
      message: "Payment recorded successfully",
      updated: updateParcel.modifiedCount,
      paymentId: insertPayment.insertedId,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to record payment", error });
  }
});

// POST /create-payment-intent
app.post("/create-payment-intent", async (req, res) => {
  const { amount } = req.body;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100, // Stripe uses cents
    currency: "bdt",
    payment_method_types: ["card"],
  });

  res.send({ clientSecret: paymentIntent.client_secret });
});



  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to Server");
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
