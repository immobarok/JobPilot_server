const express = require('express')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken');
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
/* Image upload related */
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express()
const port = process.env.PORT || 4000
require('dotenv').config()

app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));
app.use(express.json())
app.use(cookieParser());

var admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const logger = (req, res, next) => {
  console.log('inside the logger middleware');
  next();
}

const verifyFirebaseToken = async (req, res, next) => {
  console.log("Incoming Request Headers:", req.headers);
  const authHeader = req.headers?.authorization;
  console.log("Authorization Header Value:", authHeader);
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  const userInfo = await admin.auth().verifyIdToken(token);
  req.tokenEmail = userInfo.email;
  next();
}

/* Config */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API,
  api_secret: process.env.CLOUDINARY_SECRET
});

/* Storage  */
const companyLogoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'company_logos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
    public_id: () => `logo_${Date.now()}_${Math.round(Math.random() * 1E9)}`
  }
});

const blogStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'blog_images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1200, height: 800, crop: 'limit' }],
    public_id: (req, file) => `blog_${Date.now()}_${file.originalname.split('.')[0]}`
  }
});

const authorStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'author_images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
    public_id: (req, file) => `author_${req.user?.uid || 'guest'}_${Date.now()}`
  }
});


/* const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
}); */

const upload = multer({ storage: blogStorage });
const combinedUpload = multer({
  storage: blogStorage,
}).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]);

const uploadCompanyLogo = multer({ storage: companyLogoStorage });
const uploadLogo = multer({ storage: blogStorage });
const uploadCover = multer({ storage: authorStorage });



const verifyToken = (req, res, next) => {
  console.log("Cookies:", req.cookies);

  const token = req?.cookies?.token;
  if (!token) {
    console.log("No token found in cookies");
    return res.status(401).send({ message: 'Unauthorized access' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log("Token verify failed:", err.message);
      return res.status(401).send({ message: "Unauthorized access from token" });
    }

    req.decoded = decoded;
    //console.log("Token verified:", decoded);
    next();
  });
}



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
    const blogCollection = client.db('jobPilot').collection('blogs');

    //jwt realted apis
    app.post('/jwt', async (req, res) => {
      const userInfo = req.body;
      const token = jwt.sign(userInfo, process.env.JWT_SECRET, { expiresIn: '7day' })
      res.cookie('token', token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
      })
      res.send({ success: true })
    })
    //all jobs
    app.get('/jobs', async (req, res) => {
      const cursor = jobCollection.find().sort({ _id: -1 })
      const result = await cursor.toArray();
      res.send(result);
    })

    //query hanlde get api email come from api 
    //job/applications?email=${email}
    app.get('/jobs/applications', verifyToken, async (req, res) => {
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
    app.get('/jobs/jobs/:id', async (req, res) => {
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
    app.post('/add-job', uploadCompanyLogo.single('company_logo'), async (req, res) => {
      try {
        const newJob = req.body;
        const parsedSalaryRange = JSON.parse(req.body.salaryRange);
        const requirements = JSON.parse(req.body.requirements);
        const responsibilities = JSON.parse(req.body.responsibilities);
        newJob.salaryRange = parsedSalaryRange;
        newJob.requirements = requirements;
        newJob.responsibilities = responsibilities;
        newJob.postedAt = new Date();
        if (req.file) {
          newJob.company_logo = req.file.path;
          newJob.company_logo_public_id = req.file.filename;
        }
        const result = await jobCollection.insertOne(newJob);
        res.status(201).send({
          insertedId: result.insertedId,
          message: 'Job posted successfully',
          company_logo: newJob.company_logo
        });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });



    app.get('/applications', logger, verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      if (req.tokenEmail != email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
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

    app.patch('/applications/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          status: req.body.status
        }
      }
      const result = await applicaitonCollection.updateOne(query, updateStatus)
      res.send(result)
    })

    //blogs related apis
    app.get('/blogs', async (req, res) => {
      const blogs = blogCollection.find().sort({ _id: -1 })
      const result = await blogs.toArray()
      res.status(201).json(result)
    })

    app.post('/blogs', combinedUpload, async (req, res) => {
      try {
        const { title, author, publisdedDate, readTime, tags, shortDescription, content } = req.body;
        const logo = req.files['logo']?.[0]?.path;
        const coverImage = req.files['coverImage']?.[0]?.path;
        const blog = {
          title,
          author,
          publisdedDate,
          readTime,
          tags: JSON.parse(tags),
          shortDescription,
          content,
          logo,
          coverImage
        };
        const result = await blogCollection.insertOne(blog)
        res.status(201).send(result)
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Blog upload failed', error: error.message });
      }
    });


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