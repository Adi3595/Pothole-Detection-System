const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pothole_detection';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Google Gemini AI Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// MongoDB Schemas
const reportSchema = new mongoose.Schema({
    title: { type: String, required: true },
    location: { type: String, required: true },
    description: { type: String, required: true },
    severity: { type: String, required: true },
    estimated_cost: String,
    files: [{
        name: String,
        size: Number,
        type: String,
        timestamp: { type: Date, default: Date.now }
    }],
    timestamp: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    status: { type: String, default: 'Auto-Generated' },
    auto_generated: { type: Boolean, default: true },
    detection_data: {
        confidence: Number,
        coordinates: {
            latitude: Number,
            longitude: Number
        },
        image_data: String,
        timestamp_detected: Date,
        detection_count: Number,
        speed: Number,
        gps_quality: String,
        predictions: [{
            x: Number,
            y: Number,
            width: Number,
            height: Number,
            confidence: Number,
            class: String
        }]
    },
    ai_analysis: {
        severity_assessment: String,
        recommended_actions: [String],
        risk_level: String,
        estimated_repair_time: String,
        traffic_impact: String,
        safety_score: Number,
        additional_notes: String,
        rejection_reason: String,
        analysis_timestamp: { type: Date, default: Date.now }
    },
    uploaded_as_complaint: { type: Boolean, default: false },
    complaint_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint' },
    contact_email: String,
    contact_phone: String,
    priority: String,
    gps_data: {
        latitude: Number,
        longitude: Number,
        altitude: Number,
        accuracy: Number,
        timestamp: Date
    }
});

const complaintSchema = new mongoose.Schema({
    reporter_name: { type: String, required: true },
    contact_email: String,
    contact_phone: String,
    location_description: { type: String, required: true },
    issue_description: { type: String, required: true },
    priority: { type: String, default: 'Medium' },
    status: { type: String, default: 'New' },
    timestamp: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    linked_report_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    is_from_upload: { type: Boolean, default: false },
    uploaded_report_data: {
        original_report_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
        uploaded_at: { type: Date, default: Date.now },
        uploaded_by: String
    }
});

const Report = mongoose.model('Report', reportSchema);
const Complaint = mongoose.model('Complaint', complaintSchema);

// AI Report Generation Function
async function generateAIReport(detectionData) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const prompt = `
        Analyze this pothole detection data and generate a comprehensive report:
        
        Detection Details:
        - Confidence Level: ${detectionData.confidence}
        - Location Coordinates: ${detectionData.coordinates.latitude}, ${detectionData.coordinates.longitude}
        - Number of Potholes Detected: ${detectionData.detection_count}
        - GPS Quality: ${detectionData.gps_quality}
        - Timestamp: ${new Date(detectionData.timestamp_detected).toLocaleString()}
        
        Please provide a professional municipal infrastructure report with:
        1. A clear, descriptive title
        2. Detailed description of the pothole issue and location context
        3. Severity assessment (Low, Medium, High, Critical) based on confidence and count
        4. Specific recommended actions for road maintenance crew
        5. Risk level assessment for vehicles and pedestrians (High/Medium/Low)
        6. Realistic estimated repair time (e.g., "2-3 hours", "1 day")
        7. Traffic impact assessment
        8. Safety score out of 10
        9. Safety concerns and immediate actions needed
        
        Format the response as a structured JSON object with these fields:
        {
            "title": "string",
            "description": "string",
            "severity": "string",
            "recommended_actions": ["array", "of", "actions"],
            "risk_level": "string",
            "estimated_repair_time": "string",
            "traffic_impact": "string",
            "safety_score": number,
            "safety_concerns": "string"
        }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const aiResponse = JSON.parse(jsonMatch[0]);
            return {
                title: aiResponse.title || `Pothole Detection Report - ${new Date().toLocaleDateString()}`,
                description: aiResponse.description || text,
                severity: aiResponse.severity || (detectionData.confidence > 0.7 ? 'High' : detectionData.confidence > 0.5 ? 'Medium' : 'Low'),
                recommended_actions: aiResponse.recommended_actions || [
                    'Immediate location inspection',
                    'Schedule repair within 48 hours',
                    'Install temporary warning signs',
                    'Assess surrounding road surface'
                ],
                risk_level: aiResponse.risk_level || (detectionData.detection_count > 2 ? 'High' : 'Moderate'),
                estimated_repair_time: aiResponse.estimated_repair_time || (detectionData.detection_count > 2 ? '3-4 hours' : '1-2 hours'),
                traffic_impact: aiResponse.traffic_impact || 'Moderate impact on traffic flow',
                safety_score: aiResponse.safety_score || (detectionData.confidence > 0.7 ? 8 : 6),
                safety_concerns: aiResponse.safety_concerns || 'Potential vehicle damage and safety hazard for motorcycles and bicycles'
            };
        }
        
        // Fallback response
        return {
            title: `Pothole Detection Report - ${new Date().toLocaleDateString()}`,
            description: `Automated detection identified ${detectionData.detection_count} potholes with ${(detectionData.confidence * 100).toFixed(1)}% confidence at coordinates ${detectionData.coordinates.latitude}, ${detectionData.coordinates.longitude}. ${text}`,
            severity: detectionData.confidence > 0.7 ? 'High' : detectionData.confidence > 0.5 ? 'Medium' : 'Low',
            recommended_actions: [
                'Immediate location inspection',
                'Schedule repair within 48 hours',
                'Install temporary warning signs',
                'Assess surrounding road surface'
            ],
            risk_level: detectionData.detection_count > 2 ? 'High' : 'Moderate',
            estimated_repair_time: detectionData.detection_count > 2 ? '3-4 hours' : '1-2 hours',
            traffic_impact: 'Moderate impact on traffic flow',
            safety_score: detectionData.confidence > 0.7 ? 8 : 6,
            safety_concerns: 'Potential vehicle damage and safety hazard for motorcycles and bicycles'
        };
        
    } catch (error) {
        console.error('Error generating AI report:', error);
        return {
            title: `Pothole Detection Report - ${new Date().toLocaleDateString()}`,
            description: `Automated detection identified ${detectionData.detection_count} potholes at coordinates ${detectionData.coordinates.latitude}, ${detectionData.coordinates.longitude}.`,
            severity: 'Medium',
            recommended_actions: ['Inspect location', 'Schedule repair'],
            risk_level: 'Moderate',
            estimated_repair_time: '2-3 days',
            traffic_impact: 'Minimal impact',
            safety_score: 5,
            safety_concerns: 'Standard road hazard'
        };
    }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        gemini_ai: GEMINI_API_KEY ? 'Configured' : 'Not Configured',
        server: 'VS Code Development Server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// IMPORTANT: Add this location endpoint BEFORE other routes
// Location details endpoint
app.get('/api/location/:lat/:lng', async (req, res) => {
    try {
        const { lat, lng } = req.params;
        
        // Validate coordinates
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        
        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ error: 'Invalid coordinates' });
        }
        
        // Mock addresses for demonstration
        const mockAddresses = [
            `Main Street near ${Math.floor(Math.random() * 100)}th Avenue`,
            `Downtown intersection at ${Math.floor(Math.random() * 100)}th Street`,
            `Residential area near Park Avenue`,
            `Commercial district near ${Math.floor(Math.random() * 100)}th Block`,
            `Highway access road near Exit ${Math.floor(Math.random() * 10)}`
        ];
        
        const randomAddress = mockAddresses[Math.floor(Math.random() * mockAddresses.length)];
        
        res.json({
            success: true,
            location: {
                latitude: latitude,
                longitude: longitude,
                formatted_address: `${randomAddress}, City, State ${(10000 + Math.random() * 90000).toFixed(0)}`,
                address_components: {
                    street: randomAddress.split(' near ')[0],
                    area: randomAddress.split(' near ')[1],
                    city: 'City',
                    state: 'State',
                    country: 'Country'
                }
            }
        });
    } catch (error) {
        console.error('Error fetching location:', error);
        res.status(500).json({ error: 'Failed to fetch location details' });
    }
});

// Auto-detection report generation
app.post('/api/detections/auto-report', async (req, res) => {
    try {
        const { confidence, coordinates, image_data, detection_count, gps_quality, speed, predictions, timestamp } = req.body;
        
        console.log(`📡 Received detection from Raspberry Pi: ${detection_count} potholes at ${coordinates.latitude}, ${coordinates.longitude}`);
        
        if (!confidence || !coordinates) {
            return res.status(400).json({ error: 'Missing required detection data' });
        }

        const detectionData = {
            confidence,
            coordinates,
            image_data,
            detection_count: detection_count || 1,
            gps_quality: gps_quality || 'Good',
            speed: speed || 0,
            predictions: predictions || [],
            timestamp_detected: new Date(timestamp || Date.now())
        };

        // Generate AI analysis
        const aiAnalysis = await generateAIReport(detectionData);

        // Create auto-generated report
        const autoReport = new Report({
            title: aiAnalysis.title,
            location: `Coordinates: ${coordinates.latitude}, ${coordinates.longitude}`,
            description: aiAnalysis.description,
            severity: aiAnalysis.severity,
            estimated_cost: 'To be determined',
            status: 'Auto-Generated',
            auto_generated: true,
            detection_data: detectionData,
            gps_data: {
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                altitude: 0,
                accuracy: 5,
                timestamp: new Date()
            },
            ai_analysis: {
                severity_assessment: aiAnalysis.severity,
                recommended_actions: aiAnalysis.recommended_actions,
                risk_level: aiAnalysis.risk_level,
                estimated_repair_time: aiAnalysis.estimated_repair_time,
                traffic_impact: aiAnalysis.traffic_impact,
                safety_score: aiAnalysis.safety_score,
                analysis_timestamp: new Date()
            }
        });

        await autoReport.save();

        console.log(`✅ AI Report generated: ${autoReport._id}`);

        res.status(201).json({
            success: true,
            message: 'Auto-report generated successfully',
            report: autoReport,
            ai_analysis: aiAnalysis
        });

    } catch (error) {
        console.error('Error creating auto-report:', error);
        res.status(500).json({ error: 'Failed to generate auto-report' });
    }
});

// Get single report by ID (for report details page)
app.get('/api/reports/:id', async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        res.json(report);
    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Get AI reports stats
app.get('/api/reports/ai-stats', async (req, res) => {
    try {
        const [
            total,
            pending,
            uploaded,
            totalReports
        ] = await Promise.all([
            Report.countDocuments({ auto_generated: true }),
            Report.countDocuments({ auto_generated: true, status: 'Auto-Generated' }),
            Report.countDocuments({ uploaded_as_complaint: true }),
            Report.countDocuments()
        ]);
        
        // Calculate AI accuracy (mock calculation for now)
        const approvedCount = await Report.countDocuments({ auto_generated: true, status: 'Approved' });
        const accuracy = total > 0 ? Math.min(95, Math.round((approvedCount / total) * 100)) : 0;
        
        res.json({
            total: total,
            pending: pending,
            uploaded: uploaded,
            accuracy: accuracy,
            approved: approvedCount
        });
    } catch (error) {
        console.error('Error fetching AI stats:', error);
        res.status(500).json({ error: 'Failed to fetch AI statistics' });
    }
});

// Get auto-generated reports for review
app.get('/api/reports/auto-generated', async (req, res) => {
    try {
        const reports = await Report.find({ auto_generated: true })
            .sort({ timestamp: -1 })
            .limit(20);
        
        res.json(reports);
    } catch (error) {
        console.error('Error fetching auto-generated reports:', error);
        res.status(500).json({ error: 'Failed to fetch auto-generated reports' });
    }
});

// Upload report as complaint
app.post('/api/reports/:id/upload-complaint', async (req, res) => {
    try {
        const { reporter_name, contact_email, contact_phone, priority } = req.body;
        
        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        // Create complaint from report
        const complaint = new Complaint({
            reporter_name: reporter_name || 'System User',
            contact_email: contact_email || '',
            contact_phone: contact_phone || '',
            location_description: report.location,
            issue_description: `AI-Generated Report: ${report.description}`,
            priority: priority || 'Medium',
            status: 'New',
            is_from_upload: true,
            uploaded_report_data: {
                original_report_id: report._id,
                uploaded_at: new Date(),
                uploaded_by: reporter_name || 'System'
            },
            linked_report_id: report._id
        });

        await complaint.save();

        // Update report
        report.uploaded_as_complaint = true;
        report.complaint_id = complaint._id;
        report.status = 'Uploaded as Complaint';
        report.updated_at = new Date();
        await report.save();

        res.json({
            success: true,
            message: 'Report successfully uploaded as complaint',
            complaint: complaint,
            report: report
        });

    } catch (error) {
        console.error('Error uploading report as complaint:', error);
        res.status(500).json({ error: 'Failed to upload report as complaint' });
    }
});

// Get all reports with filtering
app.get('/api/reports', async (req, res) => {
    try {
        const { severity, date, search, limit, auto_generated, status } = req.query;
        let query = {};
        
        if (severity) query.severity = severity;
        if (auto_generated === 'true') query.auto_generated = true;
        if (auto_generated === 'false') query.auto_generated = false;
        if (status) query.status = status;
        
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Date filtering
        if (date) {
            const now = new Date();
            let startDate;
            
            switch (date) {
                case 'today':
                    startDate = new Date(now.setHours(0, 0, 0, 0));
                    break;
                case 'week':
                    startDate = new Date(now.setDate(now.getDate() - 7));
                    break;
                case 'month':
                    startDate = new Date(now.setMonth(now.getMonth() - 1));
                    break;
                case 'year':
                    startDate = new Date(now.setFullYear(now.getFullYear() - 1));
                    break;
            }
            
            if (startDate) {
                query.timestamp = { $gte: startDate };
            }
        }

        const reports = await Report.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit) || 100);
        
        res.json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// Get reports statistics
app.get('/api/reports/stats', async (req, res) => {
    try {
        const total = await Report.countDocuments();
        const highSeverity = await Report.countDocuments({ severity: { $in: ['High', 'Critical'] } });
        const autoGenerated = await Report.countDocuments({ auto_generated: true });
        const pendingReview = await Report.countDocuments({ auto_generated: true, status: 'Auto-Generated' });
        const uploadedAsComplaints = await Report.countDocuments({ uploaded_as_complaint: true });
        
        // Monthly count
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const monthly = await Report.countDocuments({ timestamp: { $gte: startOfMonth } });
        
        // This week
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const thisWeek = await Report.countDocuments({ timestamp: { $gte: startOfWeek } });
        
        // Today
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const today = await Report.countDocuments({ timestamp: { $gte: startOfToday } });
        
        res.json({
            total,
            highSeverity,
            monthly,
            thisWeek,
            today,
            autoGenerated,
            pendingReview,
            uploadedAsComplaints
        });
    } catch (error) {
        console.error('Error fetching report stats:', error);
        res.status(500).json({ error: 'Failed to fetch report statistics' });
    }
});

// Get all complaints
app.get('/api/complaints', async (req, res) => {
    try {
        const { priority, status, type, search } = req.query;
        let query = {};
        
        if (priority) query.priority = priority;
        if (status) query.status = status;
        if (type === 'uploaded') query.is_from_upload = true;
        if (type === 'manual') query.is_from_upload = false;
        
        if (search) {
            query.$or = [
                { reporter_name: { $regex: search, $options: 'i' } },
                { location_description: { $regex: search, $options: 'i' } },
                { issue_description: { $regex: search, $options: 'i' } },
                { contact_email: { $regex: search, $options: 'i' } }
            ];
        }

        const complaints = await Complaint.find(query)
            .populate('linked_report_id')
            .sort({ timestamp: -1 })
            .limit(100);
        
        res.json(complaints);
    } catch (error) {
        console.error('Error fetching complaints:', error);
        res.status(500).json({ error: 'Failed to fetch complaints' });
    }
});

// Get single complaint by ID
app.get('/api/complaints/:id', async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id)
            .populate('linked_report_id');
        
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }
        
        res.json(complaint);
    } catch (error) {
        console.error('Error fetching complaint:', error);
        res.status(500).json({ error: 'Failed to fetch complaint' });
    }
});

// Update complaint status
app.patch('/api/complaints/:id', async (req, res) => {
    try {
        const { status } = req.body;
        
        const complaint = await Complaint.findByIdAndUpdate(
            req.params.id,
            { 
                status: status,
                updated_at: new Date()
            },
            { new: true }
        );
        
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }
        
        res.json({
            success: true,
            message: 'Complaint status updated',
            complaint
        });
    } catch (error) {
        console.error('Error updating complaint:', error);
        res.status(500).json({ error: 'Failed to update complaint' });
    }
});

// Get complaints statistics
app.get('/api/complaints/stats', async (req, res) => {
    try {
        const total = await Complaint.countDocuments();
        const highPriority = await Complaint.countDocuments({ priority: 'High' });
        const newComplaints = await Complaint.countDocuments({ status: 'New' });
        const uploadedComplaints = await Complaint.countDocuments({ is_from_upload: true });
        
        // Monthly complaints
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const monthlyComplaints = await Complaint.countDocuments({ timestamp: { $gte: startOfMonth } });
        
        res.json({
            total,
            highPriority,
            newComplaints,
            uploadedComplaints,
            monthlyComplaints
        });
    } catch (error) {
        console.error('Error fetching complaint stats:', error);
        res.status(500).json({ error: 'Failed to fetch complaint statistics' });
    }
});

// Dashboard data
app.get('/api/dashboard', async (req, res) => {
    try {
        const reports = await Report.find()
            .sort({ timestamp: -1 })
            .limit(5);
            
        const complaints = await Complaint.find()
            .sort({ timestamp: -1 })
            .limit(5);
            
        const stats = {
            totalReports: await Report.countDocuments(),
            totalComplaints: await Complaint.countDocuments(),
            totalVideos: 0
        };
        
        res.json({
            reports,
            complaints,
            stats
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// Dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const [
            totalReports,
            autoGenerated,
            pendingReview,
            uploadedComplaints
        ] = await Promise.all([
            Report.countDocuments(),
            Report.countDocuments({ auto_generated: true }),
            Report.countDocuments({ auto_generated: true, status: 'Auto-Generated' }),
            Report.countDocuments({ uploaded_as_complaint: true })
        ]);

        // Calculate average confidence
        const reportsWithConfidence = await Report.find({ 'detection_data.confidence': { $exists: true } });
        const avgConfidence = reportsWithConfidence.length > 0 
            ? reportsWithConfidence.reduce((sum, report) => sum + (report.detection_data.confidence || 0), 0) / reportsWithConfidence.length
            : 0.82;

        // Today's detections
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const todayDetections = await Report.countDocuments({ 
            timestamp: { $gte: startOfToday } 
        });

        res.json({
            totalReports,
            autoGenerated,
            pendingReview,
            uploadedComplaints,
            todayDetections,
            avgConfidence: parseFloat(avgConfidence.toFixed(2)),
            avgSatellites: 8
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// Approve report
app.post('/api/reports/:id/approve', async (req, res) => {
    try {
        const { additional_notes, estimated_cost } = req.body;
        
        const report = await Report.findByIdAndUpdate(
            req.params.id,
            {
                status: 'Approved',
                updated_at: new Date(),
                $set: {
                    'ai_analysis.additional_notes': additional_notes,
                    estimated_cost: estimated_cost || 'To be determined'
                }
            },
            { new: true }
        );
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        res.json({
            success: true,
            message: 'Report approved successfully',
            report
        });
    } catch (error) {
        console.error('Error approving report:', error);
        res.status(500).json({ error: 'Failed to approve report' });
    }
});

// Reject report
app.post('/api/reports/:id/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        
        const report = await Report.findByIdAndUpdate(
            req.params.id,
            {
                status: 'Rejected',
                updated_at: new Date(),
                'ai_analysis.rejection_reason': reason
            },
            { new: true }
        );
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        res.json({
            success: true,
            message: 'Report rejected successfully',
            report
        });
    } catch (error) {
        console.error('Error rejecting report:', error);
        res.status(500).json({ error: 'Failed to reject report' });
    }
});

// Create manual complaint
app.post('/api/complaints', async (req, res) => {
    try {
        const complaintData = {
            ...req.body,
            timestamp: new Date(),
            updated_at: new Date()
        };
        
        const complaint = new Complaint(complaintData);
        await complaint.save();
        
        res.json({
            success: true,
            message: 'Complaint registered successfully',
            complaint
        });
    } catch (error) {
        console.error('Error creating complaint:', error);
        res.status(500).json({ error: 'Failed to create complaint' });
    }
});

// Create manual report
app.post('/api/reports', async (req, res) => {
    try {
        const reportData = {
            ...req.body,
            auto_generated: false,
            status: 'Generated',
            timestamp: new Date(),
            updated_at: new Date()
        };
        
        const report = new Report(reportData);
        await report.save();
        
        res.json({
            success: true,
            message: 'Report generated successfully',
            report
        });
    } catch (error) {
        console.error('Error creating report:', error);
        res.status(500).json({ error: 'Failed to create report' });
    }
});

// Update report
app.patch('/api/reports/:id', async (req, res) => {
    try {
        const report = await Report.findByIdAndUpdate(
            req.params.id,
            {
                ...req.body,
                updated_at: new Date()
            },
            { new: true }
        );
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        res.json({
            success: true,
            message: 'Report updated successfully',
            report
        });
    } catch (error) {
        console.error('Error updating report:', error);
        res.status(500).json({ error: 'Failed to update report' });
    }
});

// Delete report
app.delete('/api/reports/:id', async (req, res) => {
    try {
        const report = await Report.findByIdAndDelete(req.params.id);
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        res.json({
            success: true,
            message: 'Report deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

// Delete complaint
app.delete('/api/complaints/:id', async (req, res) => {
    try {
        const complaint = await Complaint.findByIdAndDelete(req.params.id);
        
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }
        
        res.json({
            success: true,
            message: 'Complaint deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting complaint:', error);
        res.status(500).json({ error: 'Failed to delete complaint' });
    }
});

// Detection control endpoints
app.post('/api/detection/start', (req, res) => {
    console.log('🟢 Detection start requested');
    res.json({ success: true, message: 'Detection started', timestamp: new Date() });
});

app.post('/api/detection/stop', (req, res) => {
    console.log('🛑 Detection stop requested');
    res.json({ success: true, message: 'Detection stopped', timestamp: new Date() });
});

// Search across reports and complaints
app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({ reports: [], complaints: [] });
        }
        
        const [reports, complaints] = await Promise.all([
            Report.find({
                $or: [
                    { title: { $regex: q, $options: 'i' } },
                    { location: { $regex: q, $options: 'i' } },
                    { description: { $regex: q, $options: 'i' } }
                ]
            }).limit(10),
            
            Complaint.find({
                $or: [
                    { reporter_name: { $regex: q, $options: 'i' } },
                    { location_description: { $regex: q, $options: 'i' } },
                    { issue_description: { $regex: q, $options: 'i' } }
                ]
            }).limit(10)
        ]);
        
        res.json({ reports, complaints });
    } catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ error: 'Failed to search' });
    }
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/auto_reports.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'auto_reports.html'));
});

app.get('/complaints.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'complaints.html'));
});

app.get('/reports.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'reports.html'));
});

app.get('/report_details.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'reports_details.html'));
});

app.get('/live_detections.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'live_detections.html'));
});

app.get('/report_generation.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'report_generation.html'));
});

app.get('/complaint_registration.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'complaint_registration.html'));
});

// Create a simple 404.html if it doesn't exist
app.get('/404.html', (req, res) => {
    res.sendFile(path.join(__dirname, '404.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// 404 handler for HTML routes
app.get('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌐 Network accessible: http://YOUR-COMPUTER-IP:${PORT}`);
    console.log('📊 MongoDB:', mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected');
    console.log('🤖 Gemini AI:', GEMINI_API_KEY ? 'Configured' : 'Not Configured');
    console.log('📁 Static files served from:', __dirname);
});