const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 4000
require('dotenv').config()

app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ki7r3ve.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    const jobCollection = client.db('jobPilot').collection('jobs');
    const applicaitonCollection = client.db('jobPilot').collection('applications');

    //all jobs
    app.get('/jobs', async (req, res) => {
      const cursor = jobCollection.find().sort({ _id: -1 })
      const result = await cursor.toArray();
      res.send(result);
    })

    //query hanlde get api email come from api 
    //job/applications?email=${email}
    app.get('/jobs/applications', async (req, res) => {
      const email = req.query.email;
      const query = { hr_email: email };
      const jobs = await jobCollection.find(query).toArray();

      // should use aggregate to have optimum data fetching
      for (const job of jobs) {
        const applicationQuery = { jobId: job._id.toString() }
        const application_count = await applicaitonCollection.countDocuments(applicationQuery)
        job.application_count = application_count;
      }
      res.send(jobs);
    })

    //get collection of jobApplicatioin
    app.get('/applications/job/:job_id', async (req, res) => {
      try {
        const id = req.params.job_id;
        const query = { jobId: id };
        const result = await applicaitonCollection.find(query).toArray();
        res.send(result)
      } catch (error) {
        res.status(401).send({ message: error })
      }
    })

    //get unique id 
    app.get('/jobs/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await jobCollection.findOne(query)
      res.send(result)
    })

    //apply for a job 
    app.post('/job-applications', async (req, res) => {
      try {
        const application = req.body;
        const result = await applicaitonCollection.insertOne(application);
        res.send(result);
      } catch (error) {
        res.status(401).send({ message: error })
      }
    })

    //job add related apis
    app.post('/add-job', async (req, res) => {
      try {
        const newJob = req.body;
        const result = await jobCollection.insertOne(newJob);
        res.status(201).send({ insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });



    app.get('/applications', async (req, res) => {
      const email = req.query.email;
      const query = {
        applicant: email
      }
      const result = await applicaitonCollection.find(query).toArray();

      // bad way to aggregate data
      for (const application of result) {
        const jobId = application.jobId;
        const jobQuery = { _id: new ObjectId(jobId) }
        const job = await jobCollection.findOne(jobQuery);
        application.company = job.company
        application.title = job.title
        application.company_logo = job.company_logo
      }
      res.send(result);
    });

    app.patch('/applications/:id', (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          status: req.body.status
        }
      }
      const result = applicaitonCollection.updateOne(query, updateStatus)
      res.send(result)
    })


    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    /* await client.close(); */
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("Server is running")
})

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})