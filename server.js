const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { S3Client, HeadBucketCommand, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();

// সব জায়গা থেকে রিকোয়েস্ট আসার অনুমতি দেওয়া (CORS fix)
app.use(cors({ origin: '*' }));
app.use(express.json());

const CONFIG_FILE = path.join(__dirname, 'wasabi_config.json');

// কনফিগারেশন পড়ার ফানশন
function getConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
    return null;
}

// Wasabi S3 Client তৈরির ফাংশন
function getS3Client(config) {
    return new S3Client({
        region: "us-east-1",
        endpoint: config.endpoint || "https://s3.wasabisys.com",
        credentials: {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey
        }
    });
}

// ১. Config Save Route
app.post('/api/wasabi/config', (req, res) => {
    const { accessKey, secretKey, bucket, endpoint, prefix } = req.body;
    if (!accessKey || !secretKey || !bucket) {
        return res.status(400).json({ message: 'Access Key, Secret Key এবং Bucket দেওয়া আবশ্যক।' });
    }
    const data = { accessKey, secretKey, bucket, endpoint, prefix };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
    res.json({ message: 'Wasabi backend configuration saved securely.' });
});

// ২. Health / Test Connection Route
app.get('/api/wasabi/health', async (req, res) => {
    const config = getConfig();
    if (!config) {
        return res.status(400).json({ message: 'আগে Wasabi Config সেভ করুন।' });
    }
    try {
        const s3 = getS3Client(config);
        await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
        res.json({ message: 'Connected to Wasabi backend successfully!' });
    } catch (err) {
        res.status(500).json({ message: 'Wasabi-র সাথে কানেক্ট করা যাচ্ছে না: ' + err.message });
    }
});

// ৩. Signed Playback URL Route (ভিডিও প্লে ব্যাক করার জন্য)
app.get('/api/wasabi/signed-url', async (req, res) => {
    const config = getConfig();
    if (!config) return res.status(400).json({ message: 'Backend config missing.' });
    const objectKey = req.query.key;
    if (!objectKey) return res.status(400).json({ message: 'Missing Wasabi object key.' });

    try {
        const s3 = getS3Client(config);
        const command = new GetObjectCommand({ Bucket: config.bucket, Key: objectKey });
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        res.json({ url });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ৪. Signed Upload URL Route (ভিডিও আপলোড করার জন্য)
app.post('/api/wasabi/upload-url', async (req, res) => {
    const config = getConfig();
    if (!config) return res.status(400).json({ message: 'Backend config missing.' });
    const { key, contentType } = req.body;

    try {
        const s3 = getS3Client(config);
        const command = new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            ContentType: contentType || 'video/mp4'
        });
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        res.json({ url });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Port listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
