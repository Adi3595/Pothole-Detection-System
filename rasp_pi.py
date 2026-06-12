import cv2
import numpy as np
import requests
import json
import time
import os
import base64
from datetime import datetime
import serial
import threading
from picamera2 import Picamera2

# === SERVER CONFIG ===
SERVER_IP = "192.168.1.8"  # Change this to your computer's IP
SERVER_PORT = "5000"
SERVER_URL = f"http://{SERVER_IP}:{SERVER_PORT}"

# === ROBOFLOW CONFIG ===
ROBOFLOW_API_KEY = "7LKIADP5UjsajWU65IxS"
ROBOFLOW_MODEL = "pothole-detection-phiqy"
ROBOFLOW_VERSION = "1"

# === SAVE DIRECTORY ===
SAVE_DIR = "/home/omgawale/pothole_detections"
os.makedirs(SAVE_DIR, exist_ok=True)

# === GPS SETUP ===
try:
    gps_serial = serial.Serial("/dev/serial0", baudrate=9600, timeout=1)
except:
    print("⚠️ GPS not available, using simulated data")
    gps_serial = None

class PotholeDetectionSystem:
    def __init__(self, server_url=SERVER_URL):
        self.server_url = server_url
        self.is_detecting = False
        self.detection_interval = 10  # Increased interval for API limits
        self.confidence_threshold = 0.5
        
        # Initialize camera
        try:
            self.camera = Picamera2()
            self.configure_camera()
        except Exception as e:
            print(f"❌ Camera error: {e}")
            self.camera = None
        
        # Roboflow Configuration
        self.roboflow_api_key = ROBOFLOW_API_KEY
        self.roboflow_model = ROBOFLOW_MODEL
        self.roboflow_version = ROBOFLOW_VERSION
        self.roboflow_url = f"https://detect.roboflow.com/{self.roboflow_model}/{self.roboflow_version}"
        
        print("✅ Roboflow client configured")
        
        # GPS setup
        self.gps_data = {
            'latitude': 0.0,
            'longitude': 0.0,
            'altitude': 0.0,
            'speed': 0.0,
            'satellites': 0,
            'timestamp': None
        }
        
        # Initialize GPS
        self.gps_serial = gps_serial
        self.setup_gps()
        
        # Statistics
        self.detection_count = 0
        self.successful_uploads = 0
        
    def configure_camera(self):
        """Configure the Raspberry Pi camera"""
        try:
            if not self.camera:
                return
                
            config = self.camera.create_preview_configuration(main={"size": (640, 480)})
            self.camera.configure(config)
            self.camera.start()
            time.sleep(2)  # Allow camera to warm up
            print("✅ Camera configured successfully")
        except Exception as e:
            print(f"❌ Camera configuration error: {e}")
    
    def setup_gps(self):
        """Setup GPS connection"""
        try:
            if not self.gps_serial:
                print("⚠️ No GPS serial connection available")
                return
                
            print("✅ GPS serial connection started")
            
            # Start GPS monitoring in separate thread
            gps_thread = threading.Thread(target=self.update_gps_data)
            gps_thread.daemon = True
            gps_thread.start()
            
        except Exception as e:
            print(f"❌ GPS setup error: {e}")
            print("⚠️  Using simulated GPS data")
    
    def parse_gps_data(self, line):
        """Parse NMEA GPS data"""
        try:
            if line.startswith('$GPGGA'):
                data = line.split(',')
                if len(data) > 6 and data[6] != '' and data[6] != '0':
                    # Parse latitude
                    lat = float(data[2][:2]) + float(data[2][2:]) / 60.0
                    if data[3] == 'S':
                        lat = -lat
                    
                    # Parse longitude
                    lon = float(data[4][:3]) + float(data[4][3:]) / 60.0
                    if data[5] == 'W':
                        lon = -lon
                    
                    # Parse altitude
                    alt = float(data[9]) if data[9] else 0.0
                    
                    # Parse satellites
                    satellites = int(data[7]) if data[7] else 0
                    
                    return {
                        'latitude': lat,
                        'longitude': lon,
                        'altitude': alt,
                        'satellites': satellites,
                        'timestamp': datetime.now().isoformat()
                    }
            return None
        except Exception as e:
            print(f"GPS parsing error: {e}")
            return None
    
    def update_gps_data(self):
        """Update GPS data continuously"""
        if not self.gps_serial:
            return
            
        while True:
            try:
                line = self.gps_serial.readline().decode('utf-8').strip()
                if line:
                    gps_data = self.parse_gps_data(line)
                    if gps_data:
                        self.gps_data.update(gps_data)
                time.sleep(1)
            except Exception as e:
                print(f"GPS update error: {e}")
                time.sleep(5)
    
    def get_simulated_gps(self):
        """Return simulated GPS data when real GPS is unavailable"""
        return {
            'latitude': 18.5204 + (np.random.random() - 0.5) * 0.01,
            'longitude': 73.8567 + (np.random.random() - 0.5) * 0.01,
            'altitude': 560.0,
            'speed': 30.0 + np.random.random() * 20,
            'satellites': 8,
            'timestamp': datetime.now().isoformat()
        }
    
    def capture_frame(self):
        """Capture a frame from the camera"""
        try:
            if not self.camera:
                # Create a simulated frame for testing
                frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
                return frame
                
            frame = self.camera.capture_array()
            # Convert RGB to BGR for OpenCV
            if len(frame.shape) == 3:
                frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            return frame
        except Exception as e:
            print(f"❌ Frame capture error: {e}")
            # Return simulated frame
            frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
            return frame
    
    def preprocess_frame(self, frame):
        """Preprocess frame for detection"""
        # Resize frame to 640x640 for Roboflow
        if frame.shape[1] != 640 or frame.shape[0] != 640:
            frame = cv2.resize(frame, (640, 640))
        
        return frame
    
    def detect_potholes_roboflow(self, frame):
        """Detect potholes using Roboflow API"""
        try:
            # Save frame temporarily for inference
            temp_path = os.path.join(SAVE_DIR, "temp_frame.jpg")
            cv2.imwrite(temp_path, frame)
            
            print(f"📤 Sending image to Roboflow API...")
            
            # Read the image file
            with open(temp_path, "rb") as f:
                image_data = f.read()
            
            # Make request to Roboflow API with correct parameters
            params = {
                'api_key': self.roboflow_api_key,
                'confidence': self.confidence_threshold,
                'format': 'json'
            }
            
            response = requests.post(
                self.roboflow_url,
                params=params,
                data=image_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30
            )
            
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
            
            print(f"📥 Roboflow response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                detections = []
                
                print(f"🔍 Roboflow raw response: {result}")
                
                if 'predictions' in result:
                    for prediction in result['predictions']:
                        confidence = prediction['confidence']
                        class_name = prediction['class']
                        
                        # Get bounding box coordinates
                        x = prediction['x']
                        y = prediction['y']
                        width = prediction['width']
                        height = prediction['height']
                        
                        # Convert center coordinates to bounding box coordinates
                        x1 = int(x - width / 2)
                        y1 = int(y - height / 2)
                        x2 = int(x + width / 2)
                        y2 = int(y + height / 2)
                        
                        # Ensure coordinates are within frame bounds
                        x1 = max(0, x1)
                        y1 = max(0, y1)
                        x2 = min(frame.shape[1], x2)
                        y2 = min(frame.shape[0], y2)
                        
                        detection = {
                            'confidence': confidence,
                            'bbox': [x1, y1, x2, y2],
                            'class_name': class_name,
                            'class_id': 0,
                            'x': x,
                            'y': y,
                            'width': width,
                            'height': height
                        }
                        detections.append(detection)
                
                print(f"✅ Roboflow detected {len(detections)} potholes")
                return detections
            else:
                print(f"❌ Roboflow API error: {response.status_code}")
                print(f"❌ Response text: {response.text}")
                return []
            
        except requests.exceptions.Timeout:
            print("❌ Roboflow API timeout")
            return []
        except requests.exceptions.ConnectionError:
            print("❌ Roboflow API connection error")
            return []
        except Exception as e:
            print(f"❌ Roboflow detection error: {e}")
            return []
    
    def detect_potholes_custom(self, frame):
        """Custom pothole detection using computer vision (fallback)"""
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Apply Gaussian blur
            blurred = cv2.GaussianBlur(gray, (7, 7), 0)
            
            # Adaptive threshold for better pothole detection
            thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                         cv2.THRESH_BINARY_INV, 11, 2)
            
            # Morphological operations to clean up the image
            kernel = np.ones((5,5), np.uint8)
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
            
            # Find contours
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            detections = []
            for contour in contours:
                area = cv2.contourArea(contour)
                
                # Filter by area (potholes are typically larger)
                if 500 < area < 20000:  # Adjusted range for potholes
                    # Calculate circularity
                    perimeter = cv2.arcLength(contour, True)
                    if perimeter > 0:
                        circularity = 4 * np.pi * area / (perimeter * perimeter)
                        
                        # Potholes tend to be irregular but somewhat circular
                        if 0.1 < circularity < 0.8:
                            x, y, w, h = cv2.boundingRect(contour)
                            
                            # Calculate confidence based on circularity and area
                            confidence = min(circularity * 1.5, 0.7)
                            
                            # Additional check: aspect ratio
                            aspect_ratio = w / h
                            if 0.3 < aspect_ratio < 3.0:  # Reasonable aspect ratio for potholes
                                detection = {
                                    'confidence': confidence,
                                    'bbox': [x, y, x + w, y + h],
                                    'class_name': 'pothole',
                                    'class_id': 0,
                                    'area': area,
                                    'circularity': circularity
                                }
                                detections.append(detection)
            
            print(f"🔧 Custom detection found {len(detections)} potential potholes")
            return detections
            
        except Exception as e:
            print(f"❌ Custom detection error: {e}")
            return []
    
    def draw_detections(self, frame, detections):
        """Draw detection bounding boxes on frame"""
        for detection in detections:
            confidence = detection['confidence']
            x1, y1, x2, y2 = map(int, detection['bbox'])
            
            # Choose color based on confidence
            if confidence > 0.7:
                color = (0, 0, 255)  # Red for high confidence
            elif confidence > 0.5:
                color = (0, 165, 255)  # Orange for medium confidence
            else:
                color = (0, 255, 255)  # Yellow for low confidence
            
            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            
            # Draw label with confidence
            label = f"{detection['class_name']}: {confidence:.2f}"
            cv2.putText(frame, label, (x1, y1 - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
            # Draw confidence bar
            bar_width = x2 - x1
            confidence_width = int(bar_width * confidence)
            cv2.rectangle(frame, (x1, y2), (x1 + confidence_width, y2 + 5), color, -1)
        
        return frame
    
    def frame_to_base64(self, frame):
        """Convert frame to base64 string"""
        try:
            # Encode frame as JPEG
            success, encoded_image = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if success:
                base64_image = base64.b64encode(encoded_image).decode('utf-8')
                return base64_image
            return None
        except Exception as e:
            print(f"❌ Image encoding error: {e}")
            return None
    
    def send_detection_to_server(self, detection_data):
        """Send detection data to the server"""
        try:
            url = f"{self.server_url}/api/detections/auto-report"
            
            # Remove image data if it's too large for testing
            test_detection_data = detection_data.copy()
            if len(str(test_detection_data.get('image_data', ''))) > 10000:
                test_detection_data['image_data'] = "TOO_LARGE_FOR_TEST"
            
            print(f"📤 Sending detection to server: {json.dumps(test_detection_data, indent=2)[:200]}...")
            
            response = requests.post(
                url,
                json=detection_data,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 201:
                result = response.json()
                if result.get('success'):
                    self.successful_uploads += 1
                    print(f"✅ Detection sent successfully (ID: {result.get('report', {}).get('_id', 'N/A')})")
                    return True
                else:
                    print(f"❌ Server returned error: {result.get('error', 'Unknown error')}")
                    return False
            else:
                print(f"❌ HTTP error {response.status_code}: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Network error: {e}")
            return False
        except Exception as e:
            print(f"❌ Unexpected error sending detection: {e}")
            return False
    
    def process_detection(self):
        """Process a single detection cycle"""
        print(f"\n🔄 Detection cycle #{self.detection_count + 1}")
        
        # Capture frame
        frame = self.capture_frame()
        if frame is None:
            print("❌ Failed to capture frame")
            return True
        
        # Preprocess frame
        processed_frame = self.preprocess_frame(frame)
        
        # Get GPS data
        if self.gps_data['latitude'] != 0:
            gps_data = self.gps_data
            print(f"📍 GPS: {gps_data['latitude']:.6f}, {gps_data['longitude']:.6f} ({gps_data['satellites']} satellites)")
        else:
            gps_data = self.get_simulated_gps()
            print(f"📍 Simulated GPS: {gps_data['latitude']:.6f}, {gps_data['longitude']:.6f}")
        
        # Try Roboflow detection first
        roboflow_detections = self.detect_potholes_roboflow(processed_frame)
        
        # If Roboflow fails or finds nothing, use custom detection
        if not roboflow_detections:
            print("🔄 Using custom detection as fallback...")
            custom_detections = self.detect_potholes_custom(processed_frame)
            all_detections = custom_detections
            detection_source = "custom"
        else:
            all_detections = roboflow_detections
            detection_source = "roboflow"
        
        # Draw detections on frame for display
        display_frame = processed_frame.copy()
        display_frame = self.draw_detections(display_frame, all_detections)
        
        # Add detection info overlay
        cv2.putText(display_frame, f"Detections: {len(all_detections)} ({detection_source})", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(display_frame, f"GPS: {gps_data['latitude']:.4f}, {gps_data['longitude']:.4f}", (10, 60), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(display_frame, f"Satellites: {gps_data['satellites']}", (10, 80), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # Display the frame with detections
        cv2.imshow('Pothole Detection - Press Q to quit', display_frame)
        
        if all_detections:
            print(f"🎯 Found {len(all_detections)} potential potholes using {detection_source}")
            
            # Calculate average confidence
            if all_detections:
                avg_confidence = sum(d['confidence'] for d in all_detections) / len(all_detections)
                print(f"📊 Average confidence: {avg_confidence:.2f}")
                
                # Convert frame to base64
                image_data = self.frame_to_base64(processed_frame)
                
                # Prepare detection data for server
                detection_data = {
                    'confidence': avg_confidence,
                    'coordinates': {
                        'latitude': gps_data['latitude'],
                        'longitude': gps_data['longitude']
                    },
                    'image_data': image_data,
                    'timestamp': datetime.now().isoformat(),
                    'detection_count': len(all_detections),
                    'gps_quality': 'real' if self.gps_data['latitude'] != 0 else 'simulated',
                    'predictions': all_detections,
                    'detection_source': detection_source
                }
                
                # Send to server
                if self.send_detection_to_server(detection_data):
                    self.detection_count += 1
                    
                    # Save annotated image locally
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = os.path.join(SAVE_DIR, f"detection_{timestamp}.jpg")
                    cv2.imwrite(filename, display_frame)
                    print(f"💾 Saved annotated image: {filename}")
                    
                else:
                    print("❌ Failed to send detection to server")
        
        else:
            print("🔍 No potholes detected in this frame")
        
        # Check for key press to exit
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            self.stop_detection()
            return False
        
        return True
    
    def start_detection(self):
        """Start continuous detection"""
        if self.is_detecting:
            print("⚠️ Detection is already running")
            return
        
        print("=" * 50)
        print("🚀 Starting Pothole Detection System")
        print("=" * 50)
        print(f"📡 Server URL: {self.server_url}")
        print(f"🤖 Roboflow Model: {self.roboflow_model}/{self.roboflow_version}")
        print(f"📁 Save directory: {SAVE_DIR}")
        print(f"⏱️ Detection interval: {self.detection_interval} seconds")
        print(f"🎯 Confidence threshold: {self.confidence_threshold}")
        print("Press 'q' in the detection window to stop")
        print("=" * 50)
        
        self.is_detecting = True
        
        try:
            while self.is_detecting:
                start_time = time.time()
                
                should_continue = self.process_detection()
                if not should_continue:
                    break
                
                # Calculate sleep time to maintain interval
                processing_time = time.time() - start_time
                sleep_time = max(0, self.detection_interval - processing_time)
                
                if sleep_time > 0:
                    time.sleep(sleep_time)
                    
        except KeyboardInterrupt:
            print("\n🛑 Detection stopped by user")
        except Exception as e:
            print(f"❌ Detection error: {e}")
        finally:
            self.stop_detection()
    
    def stop_detection(self):
        """Stop detection"""
        self.is_detecting = False
        print("\n🛑 Pothole detection stopped")
        print(f"📊 Statistics:")
        print(f"   Total detection cycles: {self.detection_count}")
        print(f"   Successful uploads: {self.successful_uploads}")
        
        # Cleanup
        cv2.destroyAllWindows()
        if hasattr(self, 'camera') and self.camera:
            self.camera.stop()
            print("✅ Camera stopped")
    
    def test_server_connection(self):
        """Test connection to the server"""
        try:
            url = f"{self.server_url}/api/health"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                print("✅ Server connection successful")
                print(f"   Status: {data.get('status')}")
                print(f"   MongoDB: {data.get('mongodb')}")
                print(f"   Gemini AI: {data.get('gemini_ai')}")
                return True
            else:
                print(f"❌ Server returned status: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Server connection failed: {e}")
            return False
    
    def test_roboflow_connection(self):
        """Test connection to Roboflow API"""
        try:
            # Create a simple test image
            test_frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            test_path = os.path.join(SAVE_DIR, "test_frame.jpg")
            cv2.imwrite(test_path, test_frame)
            
            with open(test_path, "rb") as f:
                image_data = f.read()
            
            params = {
                'api_key': self.roboflow_api_key,
                'confidence': 0.5,
                'format': 'json'
            }
            
            print("🔍 Testing Roboflow connection...")
            response = requests.post(
                self.roboflow_url,
                params=params,
                data=image_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30
            )
            
            if os.path.exists(test_path):
                os.remove(test_path)
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Roboflow API connection successful")
                print(f"   Response keys: {list(result.keys())}")
                return True
            else:
                print(f"❌ Roboflow API error: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Roboflow connection test failed: {e}")
            return False

def main():
    """Main function"""
    print("🤖 Raspberry Pi Pothole Detection System")
    print("📍 Using Roboflow API for real-time pothole detection")
    
    # Create detection system
    detector = PotholeDetectionSystem(server_url=SERVER_URL)
    
    # Test server connection
    if not detector.test_server_connection():
        print("⚠️  Cannot connect to server. Check if server is running and IP is correct.")
        print(f"⚠️  Server URL: {SERVER_URL}")
        return
    
    # Test Roboflow connection
    if not detector.test_roboflow_connection():
        print("⚠️  Roboflow API test failed. The system will use custom detection as fallback.")
        print("⚠️  Check: 1) API key validity 2) Internet connection 3) Model accessibility")
    
    # Start detection anyway (will use custom detection as fallback)
    try:
        detector.start_detection()
    except Exception as e:
        print(f"❌ Fatal error: {e}")
    finally:
        detector.stop_detection()

if __name__ == "__main__":
    main()