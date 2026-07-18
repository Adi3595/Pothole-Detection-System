POTHOLEDETECTION SYSTEM WITH MONGODB
=====================================

## COMPLETE SETUP INSTRUCTIONS

PREREQUISITES:
1. Node.js (version 14 or higher)
2. MongoDB (version 4.4 or higher)
3. MongoDB Compass (optional, for GUI)

STEP-BY-STEP SETUP:

1. CREATE PROJECT FOLDER:
   mkdir pothole-detection
   cd pothole-detection

2. SAVE ALL FILES:
   Save all 7 files in the same directory:
   - server.js
   - package.json
   - index.html
   - report_generation.html
   - complaint_registration.html
   - reports.html
   - complaints.html

3. INSTALL DEPENDENCIES:
   npm install

4. START MONGODB:
   Make sure MongoDB is running on your system.
   On Windows: Run "mongod" from command prompt
   On Mac/Linux: Run "sudo systemctl start mongod" or "brew services start mongodb"

5. START THE SERVER:
   npm start

6. ACCESS THE APPLICATION:
   Open your browser and go to: http://localhost:5000

---

## FEATURES:
      ✅ MongoDB Integration - All data stored in MongoDB
      ✅ Real-time Dashboard with statistics
      ✅ Report Generation with file upload
      ✅ Complaint Registration with forms
      ✅ View All Reports with filtering
      ✅ View All Complaints with search
      ✅ Responsive Design for all devices
      ✅ Real-time MongoDB connection status

MONGODB COLLECTIONS:
- reports: Stores all pothole reports
- complaints: Stores all citizen complaints

---

## API ENDPOINTS:
      GET  /api/health          - Check MongoDB status
      GET  /api/dashboard       - Get dashboard data
      GET  /api/reports         - Get all reports
      POST /api/reports         - Create new report
      GET  /api/reports/stats   - Get report statistics
      GET  /api/complaints      - Get all complaints
      POST /api/complaints      - Create new complaint
      GET  /api/complaints/stats - Get complaint statistics

---

## TROUBLESHOOTING:

1. If you see "MongoDB: Disconnected":
   - Make sure MongoDB is running
   - Check if MongoDB is on the default port 27017
   - Verify the connection string in server.js

2. If the server won't start:
   - Check if port 5000 is available
   - Verify all dependencies are installed
   - Check Node.js version (should be 14+)

3. If pages don't load:
   - Make sure all HTML files are in the same directory
   - Check browser console for errors
   - Verify the server is running on port 5000
  
---

## SUPPORT:
For issues, check:
1. MongoDB logs
2. Node.js server console
3. Browser developer console

---

## Contributors:      
Aditya Gawali      
Atharva Ghule

ENJOY YOUR POTHOLEDETECTION SYSTEM! 🚀

