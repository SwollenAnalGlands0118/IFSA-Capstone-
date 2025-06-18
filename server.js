const express = require('express');
const path = require('path');
const app = express();
require('dotenv').config();
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;

const connectDB = require('./db'); // Import your connection function

// Database connection middleware
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error('Database connection failed:', error);
        res.status(500).json({ 
            error: 'Database connection failed',
            message: 'Please try again later'
        });
    }
});

// Define the Sticky Set schema
const stickySetSchema = new mongoose.Schema({
    stickies: [{
        type: mongoose.Schema.Types.Mixed,
        required: true
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastAccessed: {
        type: Date,
        default: Date.now
    }
});

// Create the model
const StickySet = mongoose.model('StickySet', stickySetSchema);    

// Replace the existing /:id route handler with this:
app.get('/:id', (req, res, next) => {
    const id = req.params.id;

    // Check if it's a valid MongoDB ObjectId (24 hex characters)
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
        // Serve your main HTML file (Vue app)
        res.sendFile(path.join(__dirname, 'static', 'index.html'));
    } else {
        // Let static middleware handle other files (CSS, JS, etc.)
        next();
    }
});

// Serve static files from the 'static' folder
app.use(express.static(path.join(__dirname, 'static')));

// Middleware to parse JSON
app.use(express.json());

// 1. Create new stickies with provided stickies array (only way to create new stickies)
app.post('/api/', async (req, res) => {
    try {
        const stickies = req.body;

        if (!Array.isArray(stickies)) {
            return res.status(400).json({ error: 'Stickies must be an array' });
        }

        if (stickies.length === 0) {
            return res.status(400).json({ error: 'Stickies array cannot be empty' });
        }

        const newStickySet = new StickySet({
            stickies: stickies
        });

        const savedStickySet = await newStickySet.save();

        // Return the saved document with MongoDB-generated _id
        res.status(201).json({
            id: savedStickySet._id,
            stickies: savedStickySet.stickies,
            createdAt: savedStickySet.createdAt,
            lastAccessed: savedStickySet.lastAccessed
        });
    } catch (error) {
        console.error('Error creating stickies:', error);
        res.status(500).json({ error: 'Failed to create stickies' });
    }
});

// 2. Stickies endpoint - serve stickies or return 404 if not exists
app.get('/api/:id', async (req, res) => {
    try {
        const id = req.params.id;

        // Validate MongoDB ObjectId format
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: 'Invalid stickies ID format' });
        }

        const stickySet = await StickySet.findById(id);

        if (!stickySet) {
            return res.status(404).json({ error: 'Stickies not found' });
        }

        // Update last accessed time
        stickySet.lastAccessed = new Date();
        await stickySet.save();

        // Return the sticky set data
        res.json({
            id: stickySet._id,
            stickies: stickySet.stickies,
            createdAt: stickySet.createdAt,
            lastAccessed: stickySet.lastAccessed
        });
    } catch (error) {
        console.error('Error fetching stickies:', error);
        res.status(500).json({ error: 'Failed to fetch stickies' });
    }
});

// 3. Update entire stickies (replace all stickies)
app.put('/api/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const stickies = req.body;

        if (!Array.isArray(stickies)) {
            return res.status(400).json({ error: 'Stickies must be an array' });
        }

        if (stickies.length === 0) {
            return res.status(400).json({ error: 'Stickies array cannot be empty. Use DELETE to remove stickies.' });
        }

        const stickySet = await StickySet.findById(id);
        if (!stickySet) {
            return res.status(404).json({ error: 'Stickies not found' });
        }

        // Update the stickies and last accessed time
        stickySet.stickies = stickies;
        stickySet.lastAccessed = new Date();
        const updatedStickySet = await stickySet.save();

        res.json({
            id: updatedStickySet._id,
            stickies: updatedStickySet.stickies,
            createdAt: updatedStickySet.createdAt,
            lastAccessed: updatedStickySet.lastAccessed
        });
    } catch (error) {
        console.error('Error updating stickies:', error);
        res.status(500).json({ error: 'Failed to update stickies' });
    }
});

// 4. Delete entire stickies collection
app.delete('/api/:id', async (req, res) => {
    try {
        const id = req.params.id;

        // Validate MongoDB ObjectId format
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: 'Invalid stickies ID format' });
        }

        const deletedStickySet = await StickySet.findByIdAndDelete(id);

        if (!deletedStickySet) {
            return res.status(404).json({ error: 'Stickies not found' });
        }

        res.json({
            message: 'Stickies deleted successfully',
            id: deletedStickySet._id,
            stickiesCount: deletedStickySet.stickies.length
        });
    } catch (error) {
        console.error('Error deleting stickies:', error);
        res.status(500).json({ error: 'Failed to delete stickies' });
    }
});

// Health check endpoint
app.get('/api/get/health', async (req, res) => {
    try {
        const totalCollections = await StickySet.countDocuments();

        // Calculate total stickies across all collections
        const aggregationResult = await StickySet.aggregate([
            {
                $project: {
                    stickiesCount: { $size: "$stickies" }
                }
            },
            {
                $group: {
                    _id: null,
                    totalStickies: { $sum: "$stickiesCount" }
                }
            }
        ]);

        const totalStickies = aggregationResult.length > 0 ? aggregationResult[0].totalStickies : 0;

        // Get recent stickies (last 5 accessed)
        const recentStickies = await StickySet.find()
            .sort({ lastAccessed: -1 })
            .limit(5)
            .select('_id stickies lastAccessed');

        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            totalStickiesCollections: totalCollections,
            totalStickies: totalStickies,
            recentStickies: recentStickies.map(stickySet => ({
                id: stickySet._id,
                stickiesCount: stickySet.stickies.length,
                lastAccessed: stickySet.lastAccessed
            }))
        });
    } catch (error) {
        console.error('Error in health check:', error);
        res.status(500).json({ error: 'Health check failed' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Anonymous Stickies API Server running on http://localhost:${PORT}`);
});