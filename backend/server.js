const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs'); // To save GLTF files
const path = require('path'); // To handle file paths

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '400mb' })); // Increase the limit for JSON payloads
app.use(bodyParser.urlencoded({ extended: true, limit: '400mb' })); // Increase limit for URL-encoded payloads

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
const MONGO_URI = "mongodb+srv://anaparthinithin1829:kmW7rzJ4soyiM6x3@cluster0.c6nh1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('Error connecting to MongoDB:', err));

// JWT Secret Key
const JWT_SECRET = 'your_jwt_secret'; // Replace with a secure secret in production

// User model schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  measurements: {
    height: Number,
    chest: Number,
    waist: Number,
    hips: Number,
    clothingLink: String,
  },
  gltfFile: { type: String } // Path to the exported GLTF file
});

const User = mongoose.model('User', UserSchema);

// Middleware to verify the JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(400).json({ message: 'Invalid token' });
  }
}

// Register route
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save new user
    user = new User({ email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });

    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// API route to handle submission of body measurements and GLTF model
app.post('/api/measurements', authenticateToken, async (req, res) => {
  const { height, chest, waist, hips, model } = req.body;

  if (!height || !chest || !waist || !hips || !model) {
    return res.status(400).json({ message: 'All fields are required, including the model' });
  }

  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Save the GLTF model to the server
    const gltfFileName = `model_${user._id}_${Date.now()}.gltf`;
    const gltfFilePath = path.join(__dirname, 'uploads', gltfFileName);
    fs.writeFileSync(gltfFilePath, model, 'utf8'); // Save the GLTF data to a file

    // Log the file path for debugging
    console.log('GLTF file saved at:', gltfFilePath);

    // Update the user's measurements and GLTF file link
    user.measurements = { height, chest, waist, hips };
    user.gltfFile = gltfFileName; // Save only the file name in the database
    await user.save();

    res.status(200).json({ message: 'Measurements and model saved successfully' });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ message: 'Error saving data', error });
  }
});

// API route to retrieve body measurements and GLTF model
app.get('/api/measurements', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user || !user.measurements) {
      return res.status(404).json({ message: 'User or measurements not found' });
    }

    // Construct the public path for the GLTF file
    const publicGltfPath = `/uploads/${path.basename(user.gltfFile)}`;
    res.status(200).json({ measurements: user.measurements, gltfFile: publicGltfPath });
  } catch (error) {
    console.error('Error retrieving data:', error);
    res.status(500).json({ message: 'Error retrieving data', error });
  }
});

// Protected route example
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route. You are authenticated!', user: req.user });
});

// Create the `uploads` directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 