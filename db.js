// db.js
const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
    // If already connected, reuse the connection
    if (isConnected) {
        console.log('Using existing MongoDB connection');
        return;
    }

    try {
        // Connect with optimized settings for serverless
        await mongoose.connect(process.env.MONGODB_URI, {
            bufferCommands: false,           // Disable mongoose buffering
            maxPoolSize: 10,                 // Maximum 10 connections in pool
            serverSelectionTimeoutMS: 5000,  // Timeout after 5 seconds
            socketTimeoutMS: 45000,          // Close sockets after 45 seconds
            maxIdleTimeMS: 30000,            // Close connections after 30 seconds of inactivity
        });

        isConnected = true;
        console.log('Connected to MongoDB Atlas');

        // Handle connection events
        mongoose.connection.on('connected', () => {
            console.log('Mongoose connected to MongoDB');
        });

        mongoose.connection.on('error', (err) => {
            console.error('Mongoose connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('Mongoose disconnected');
            isConnected = false;
        });

    } catch (error) {
        console.error('MongoDB connection error:', error);
        isConnected = false;
        throw error;
    }
};

module.exports = connectDB;