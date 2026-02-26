require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

// Configure AWS S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Configure Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Configure Multer to keep files in memory before sending to S3
const upload = multer({ storage: multer.memoryStorage() });

// --- THE TEST HOMEPAGE ---
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: Arial, sans-serif; padding: 50px;">
                <h2>AsyncArt Test Upload</h2>
                <p>Select a 2D image to upload to your AWS S3 bucket and queue a job in MySQL.</p>
                
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="file" name="image" accept="image/*" required style="margin-bottom: 20px;"/><br>
                    <button type="submit" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Upload to AWS & Queue Job
                    </button>
                </form>
            </body>
        </html>
    `);
});

// --- THE MAIN UPLOAD ENDPOINT ---
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }

        const jobId = uuidv4();
        // Create a unique file name for S3
        const s3FileKey = `uploads/${jobId}-${req.file.originalname}`;

        // 1. Upload the image to AWS S3
        const s3Params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: s3FileKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };
        await s3Client.send(new PutObjectCommand(s3Params));

        // 2. Insert a new job into the MySQL Database
        const query = `INSERT INTO Jobs (id, status, original_image_key) VALUES (?, 'QUEUED', ?)`;
        await pool.execute(query, [jobId, s3FileKey]);

        // 3. Return the Job ID immediately to the user
        res.status(202).json({ 
            message: 'Image uploaded successfully and job queued.',
            jobId: jobId,
            status: 'QUEUED'
        });

    } catch (error) {
        console.error('Error in /upload pipeline:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- THE STATUS CHECK ENDPOINT ---
app.get('/status/:jobId', async (req, res) => {
    const { jobId } = req.params;

    try {
        // 1. Look up the job in the database
        const [rows] = await pool.execute('SELECT * FROM Jobs WHERE id = ?', [jobId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const job = rows[0];

        // 2. If it is still processing or queued, just tell the user to wait
        if (job.status !== 'COMPLETED') {
            return res.status(200).json({ status: job.status });
        }

        // 3. If it IS completed, generate a secure download link that expires in 1 hour
        const getObjectParams = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: job.result_file_key
        };
        const command = new GetObjectCommand(getObjectParams);
        const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        // 4. Send the final success response!
        res.status(200).json({
            status: 'COMPLETED',
            downloadUrl: downloadUrl
        });

    } catch (error) {
        console.error('Error fetching job status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`AsyncArt API listening at http://localhost:${port}`);
});