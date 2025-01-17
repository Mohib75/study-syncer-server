const express = require("express")
const cors = require("cors")
const jwt = require("jsonwebtoken")
const cookieParser = require("cookie-parser")
require("dotenv").config()
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb")
const app = express()
const port = process.env.PORT || 5000
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

const cookieOptions = {
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
}

// middleware
app.use(
	cors({
		origin: ["http://localhost:5173", "https://study-syncer.surge.sh", "study-syncer-8735c.web.app", "study-syncer-8735c.firebaseapp.com"],
		credentials: true,
	})
)
app.use(express.json())
app.use(cookieParser())

// StudySyncer
// pTjeyX0wMBzDr7Pf

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gs81nyj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
})

// middlewares
const logger = (req, res, next) => {
	console.log("log: info", req.method, req.url)
	next()
}

const verifyToken = async (req, res, next) => {
	const token = req.cookies?.token
	console.log(token)
	if (!token) {
		return res.status(401).send({ message: "unauthorized access" })
	}
	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
		if (err) {
			console.log(err)
			return res.status(401).send({ message: "unauthorized access" })
		}
		req.user = decoded
		next()
	})
}

async function run() {
	try {
		// Connect the client to the server	(optional starting in v4.7)
		// await client.connect()

		const assignmentCollection = client.db("assignmentDB").collection("assignment")

		const submittedAssignmentCollection = client.db("assignmentDB").collection("submittedAssignment")

		const courseCollection = client.db("assignmentDB").collection("courses")

		const enrolledCourseCollection = client.db("assignmentDB").collection("enrolledCourses")

		// auth related api
		//creating Token
		app.post("/jwt", logger, async (req, res) => {
			const user = req.body
			console.log("user for token", user)
			const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET)

			res.cookie("token", token, cookieOptions).send({ success: true })
		})

		app.post("/logout", async (req, res) => {
			const user = req.body
			console.log("logging out", user)
			res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).send({ success: true })
		})

		app.get("/assignment", logger, async (req, res) => {
			const page = parseInt(req.query.page)
			const size = parseInt(req.query.size)
			const cursor = assignmentCollection.find()
			const result = await cursor
				.skip(page * size)
				.limit(size)
				.toArray()
			res.send(result)
		})

		app.get("/courses", logger, async (req, res) => {
			const page = parseInt(req.query.page)
			const size = parseInt(req.query.size)
			const cursor = courseCollection.find()
			const result = await cursor
				.skip(page * size)
				.limit(size)
				.toArray()
			res.send(result)
		})

		app.get("/assignment/:id", async (req, res) => {
			const id = req.params.id
			const query = { _id: new ObjectId(id) }
			const result = await assignmentCollection.findOne(query)
			res.send(result)
		})

		app.get("/courses/:id", async (req, res) => {
			const id = req.params.id
			const query = { _id: new ObjectId(id) }
			const result = await courseCollection.findOne(query)
			res.send(result)
		})

		app.get("/assignmentCount", async (req, res) => {
			const count = await assignmentCollection.estimatedDocumentCount()
			res.send({ count })
		})

		app.get("/courseCount", async (req, res) => {
			const count = await courseCollection.estimatedDocumentCount()
			res.send({ count })
		})

		app.get("/submittedAssignment", logger, async (req, res) => {
			const cursor = submittedAssignmentCollection.find()
			const result = await cursor.toArray()
			res.send(result)
		})

		app.get("/submittedAssignment/:id", async (req, res) => {
			const id = req.params.id
			const query = { _id: new ObjectId(id) }
			const result = await submittedAssignmentCollection.findOne(query)
			res.send(result)
		})

		app.get("/mySubmittedAssignment/:email", async (req, res) => {
			const cursor = submittedAssignmentCollection.find({ email: req.params.email })
			const result = await cursor.toArray()
			res.send(result)
		})

		app.get("/myCourses/:email", async (req, res) => {
			const email = req.params.email
			const query = { email: email }
			const cursor = enrolledCourseCollection.find(query)
			const result = await cursor.toArray()
			res.send(result)
		})

		app.post("/assignment", async (req, res) => {
			const newAssignment = req.body
			const result = await assignmentCollection.insertOne(newAssignment)
			res.send(result)
		})

		app.post("/submittedAssignment", async (req, res) => {
			const newAssignment = req.body
			const result = await submittedAssignmentCollection.insertOne(newAssignment)
			res.send(result)
		})

		app.post("/enrolledCourses", async (req, res) => {
			const newCourse = req.body
			const result = await enrolledCourseCollection.insertOne(newCourse)
			res.send(result)
		})

		app.post("/courses", async (req, res) => {
			const newCourse = req.body
			const result = await courseCollection.insertOne(newCourse)
			res.send(result)
		})

		// create-payment-intent
		app.post("/create-payment-intent", async (req, res) => {
			const price = req.body.price
			const priceInCent = parseFloat(price) * 100
			if (!price || priceInCent < 1) return
			// generate clientSecret
			const { client_secret } = await stripe.paymentIntents.create({
				amount: priceInCent,
				currency: "usd",
				// In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
				automatic_payment_methods: {
					enabled: true,
				},
			})
			// send client secret as response
			res.send({ clientSecret: client_secret })
		})

		app.put("/assignment/:id", async (req, res) => {
			const id = req.params.id
			const filter = { _id: new ObjectId(id) }
			const options = { upsert: true }
			const updatedAssignment = req.body
			const assignment = {
				$set: {
					title: updatedAssignment.title,
					image: updatedAssignment.image,
					description: updatedAssignment.description,
					marks: updatedAssignment.marks,
					difficulty: updatedAssignment.difficulty,
					date: updatedAssignment.date,
				},
			}

			const result = await assignmentCollection.updateOne(filter, assignment, options)
			res.send(result)
		})

		app.put("/submittedAssignment/:id", async (req, res) => {
			const id = req.params.id
			const filter = { _id: new ObjectId(id) }
			const options = { upsert: true }
			const updatedAssignment = req.body
			const assignment = {
				$set: {
					obtainedMarks: updatedAssignment.obtainedMarks,
					feedback: updatedAssignment.feedback,
				},
			}

			const result = await submittedAssignmentCollection.updateOne(filter, assignment, options)
			res.send(result)
		})

		app.delete("/assignment/:id", async (req, res) => {
			const id = req.params.id
			const query = { _id: new ObjectId(id) }
			const result = await assignmentCollection.deleteOne(query)
			res.send(result)
		})

		// Send a ping to confirm a successful connection
		// await client.db("admin").command({ ping: 1 })
		console.log("Pinged your deployment. You successfully connected to MongoDB!")
	} finally {
		// Ensures that the client will close when you finish/error
		// await client.close()
	}
}
run().catch(console.dir)

app.get("/", (req, res) => {
	res.send("StudySyncer server is running")
})

app.listen(port, () => {
	console.log(`StudySyncer Server is running on port: ${port}`)
})
