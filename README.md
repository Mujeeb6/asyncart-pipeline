# AsyncArt Pipeline: Asynchronous AI Media Processing Backend

> A distributed backend architecture designed to handle long-running, asynchronous media processing tasks (like 2D-to-3D AI reconstruction workflows) without blocking the main web server.

## 🚀 Overview

In generative AI applications, rendering or inferencing tasks can take anywhere from seconds to minutes. A standard synchronous HTTP request would time out or block the Node.js event loop. 

This project solves that by implementing an **asynchronous worker pipeline**. 
A Node.js API acts as the gateway, securely storing user uploads in AWS S3 and queueing jobs in a MySQL database. A completely independent Python background worker continuously polls the database, claims pending jobs, executes the "heavy" simulated AI processing, and uploads the generated assets back to S3.

## 🏗️ Architecture

1. **User** uploads a 2D image via the Web API.
2. **Node.js (Express)** receives the file, uploads the raw image to **AWS S3**, and inserts a `QUEUED` job record into **AWS RDS (MySQL)**.
3. The API immediately returns a `jobId` to the user.
4. The **Python Worker** continuously polls the database. It finds the `QUEUED` job and marks it as `PROCESSING`.
5. The Worker downloads the original image from S3, performs simulated processing (representing ML inference), and generates a 3D `.obj` file.
6. The Worker uploads the new `.obj` asset back to S3 and updates the database status to `COMPLETED`.
7. The User checks the `/status/:jobId` endpoint. Node.js detects the `COMPLETED` status and generates a secure, temporary **AWS S3 Pre-signed URL** for the user to download their asset.

## 💻 Tech Stack

* **API Gateway:** Node.js, Express, Multer
* **Background Worker:** Python 3, Boto3, MySQL-Connector
* **Database:** MySQL (Hosted on AWS RDS Free Tier)
* **Cloud Storage:** AWS S3
* **Infrastructure / Cloud:** AWS IAM, Pre-signed URLs

## 🛠️ Local Setup & Installation

### Prerequisites
* Node.js (v16+)
* Python (3.8+)
* An AWS Account (with an S3 Bucket and RDS MySQL instance provisioned)

### 1. Clone the Repository
\`\`\`bash
git clone https://github.com/Mujeeb6/asyncart-pipeline.git
cd asyncart-pipeline
\`\`\`

### 2. Environment Variables
Create a \`.env\` file in the root directory and configure your credentials based on the provided \`.env.example\` file:
\`\`\`env
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET_NAME=your_bucket_name

DB_HOST=your_rds_endpoint
DB_USER=admin
DB_PASSWORD=your_password
DB_NAME=asyncart
\`\`\`

### 3. Start the Node.js API
\`\`\`bash
npm install
node server.js
\`\`\`
*The server will start on \`http://localhost:3000\`*

### 4. Start the Python Worker
In a separate terminal window:
\`\`\`bash
pip install -r requirements.txt
python worker.py
\`\`\`

## 🔌 API Endpoints

### `POST /upload`
Accepts a `multipart/form-data` image file. Securely pipes the file to AWS S3 and queues the database job.
**Response:**
\`\`\`json
{
  "message": "Image uploaded successfully and job queued.",
  "jobId": "8f95380c-78f1-4ae0-9f3e-9ca902043e9e",
  "status": "QUEUED"
}
\`\`\`

### `GET /status/:jobId`
Checks the current state of a processing job. If completed, returns a secure AWS S3 download link.
**Response (Pending):**
\`\`\`json
{
  "status": "PROCESSING"
}
\`\`\`
**Response (Completed):**
\`\`\`json
{
  "status": "COMPLETED",
  "downloadUrl": "https://your-bucket.s3.amazonaws.com/results/..."
}
\`\`\`

---
*Developed as a technical demonstration of scalable backend architectures for generative AI pipelines.*