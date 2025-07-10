require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const swaggerUi = require('swagger-ui-express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');

const app = express();
const saltRounds = 10;
const secret = 'pj2';

// ==== Socket.IO instance holder ====
let ioInstance = null;
function setIO(io) {
  ioInstance = io;
}
function getIO() {
  if (!ioInstance) throw new Error("Socket.IO instance is not set");
  return ioInstance;
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const deleteImageFile = (filename) => {
  if (filename) {
    const filePath = path.join(__dirname, 'uploads', filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
};

// Swagger
const file = fs.readFileSync(path.join(__dirname, 'swagger.yaml'), 'utf8');
const swaggerDocument = YAML.parse(file);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// DB
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 44432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4'
});
const query = (sql, values = []) => new Promise((resolve, reject) => {
  db.execute(sql, values, (err, results) => (err ? reject(err) : resolve(results)));
});

// JWT
const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized. Token is missing.' });
  jwt.verify(token, secret, (err, decoded) => {
    if (err) return res.status(403).json({ status: 'error', message: 'Forbidden. Invalid or expired token.' });
    req.user = decoded;
    next();
  });
};

// Register user
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ status: 'error', message: 'Username and password are required.' });
    }
    try {
        const hash = await bcrypt.hash(password, saltRounds);
        await query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
        res.status(201).json({ status: 'ok', message: 'Registration successful.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

// Login user
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = await query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        }
        const isLogin = await bcrypt.compare(password, users[0].password);
        if (isLogin) {
            const token = jwt.sign(
                { username: users[0].username, role: users[0].role },
                secret,
                { expiresIn: '24h' }
            );
            res.json({ status: 'ok', message: 'Login success.', token, user: users[0] });
        } else {
            res.status(401).json({ status: 'error', message: 'Invalid password.' });
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

// Get server time
app.get('/api/time', (req, res) => {
    res.json({ status: 'ok', time: Date.now() });
});

// CRUD operations for Vehicles
app.post('/vehicles', authenticateJWT, upload.single('license_plate_img'), async (req, res) => {
    const { license_plate, province, vehicle_type, vehicle_color, vehicle_brand } = req.body;
    const license_plate_img_path = req.file ? req.file.filename : null;

    if (!license_plate || !province || !vehicle_type || !vehicle_color || !vehicle_brand) {
        return res.status(400).json({ status: 'error', message: 'All fields are required.' });
    }

    try {
        await query(
            'INSERT INTO vehicle (license_plate, province, license_plate_img_path, vehicle_type, vehicle_color, vehicle_brand) VALUES (?, ?, ?, ?, ?, ?)',
            [license_plate, province, license_plate_img_path, vehicle_type, vehicle_color, vehicle_brand]
        );
        const vehicles = await query('SELECT * FROM vehicle');
        io.emit('vehicles_updated', vehicles);
        res.status(201).json({ status: 'ok', message: 'Vehicle added successfully.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.get('/vehicles', authenticateJWT, async (req, res) => {
    try {
        const vehicles = await query('SELECT * FROM vehicle');
        res.json({ status: 'ok', vehicles });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.get('/vehicles/:id', authenticateJWT, async (req, res) => {
    const { id } = req.params;
    try {
        const vehicles = await query('SELECT * FROM vehicle WHERE id = ?', [id]);
        if (vehicles.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Vehicle not found.' });
        }
        res.json({ status: 'ok', vehicle: vehicles[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.put('/vehicles/:id', authenticateJWT, upload.single('license_plate_img'), async (req, res) => {
    const { id } = req.params;
    const { license_plate, province, vehicle_type, vehicle_color, vehicle_brand } = req.body;
    const license_plate_img_path = req.file ? req.file.filename : null;

    try {
        const [vehicle] = await query('SELECT license_plate_img_path FROM vehicle WHERE id = ?', [id]);
        if (vehicle && vehicle.license_plate_img_path) {
            deleteImageFile(vehicle.license_plate_img_path);
        }

        await query(
            'UPDATE vehicle SET license_plate = ?, province = ?, license_plate_img_path = ?, vehicle_type = ?, vehicle_color = ?, vehicle_brand = ? WHERE id = ?',
            [license_plate, province, license_plate_img_path, vehicle_type, vehicle_color, vehicle_brand, id]
        );
        const vehicles = await query('SELECT * FROM vehicle');
        const io = getIO();
        io.emit('vehicles_updated', vehicles);
        res.json({ status: 'ok', message: 'Vehicle updated successfully.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.delete('/vehicles/:id', authenticateJWT, async (req, res) => {
    const { id } = req.params;
    try {
        const [vehicle] = await query('SELECT license_plate_img_path FROM vehicle WHERE id = ?', [id]);
        if (vehicle && vehicle.license_plate_img_path) {
            deleteImageFile(vehicle.license_plate_img_path);
        }
        await query('DELETE FROM vehicle WHERE id = ?', [id]);
        const vehicles = await query('SELECT * FROM vehicle');
        const io = getIO();
        io.emit('vehicles_updated', vehicles);
        res.json({ status: 'ok', message: 'Vehicle deleted successfully.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

// CRUD operations for Blacklist (แยกจาก Vehicle)
app.post('/blacklist', authenticateJWT, upload.single('license_plate_img'), async (req, res) => {
    const { license_plate, province, vehicle_type, vehicle_color, vehicle_brand, reason } = req.body;
    const license_plate_img_path = req.file ? req.file.filename : null;

    if (!license_plate || !province || !vehicle_type || !vehicle_color || !vehicle_brand || !reason) {
        return res.status(400).json({ status: 'error', message: 'All fields are required.' });
    }

    try {
        const queryStr = `
            INSERT INTO blacklist (license_plate, province, vehicle_type, vehicle_color, vehicle_brand, reason, license_plate_img_path, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        const values = [license_plate, province, vehicle_type, vehicle_color, vehicle_brand, reason, license_plate_img_path];
        const result = await query(queryStr, values);

        const newBlacklist = {
            id: result.insertId,
            license_plate,
            province,
            vehicle_type,
            vehicle_color,
            vehicle_brand,
            reason,
            license_plate_img_path,
            added_at: new Date().toISOString(),
        };
        const io = getIO();
        io.emit('blacklist_updated', [newBlacklist]);
        res.status(201).json({ status: 'ok', blacklist: newBlacklist });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.get('/blacklist', authenticateJWT, async (req, res) => {
    try {
        const blacklist = await query('SELECT * FROM blacklist');
        res.json({ status: 'ok', blacklist });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.put('/blacklist/:id', authenticateJWT, upload.single('license_plate_img'), async (req, res) => {
    const { id } = req.params;
    const { license_plate, province, vehicle_type, vehicle_color, vehicle_brand, reason, license_plate_img_path } = req.body;

    if (!license_plate || !province || !vehicle_type || !vehicle_color || !vehicle_brand || !reason) {
        return res.status(400).json({ status: 'error', message: 'All fields are required.' });
    }

    try {
        const [oldBlacklist] = await query('SELECT license_plate_img_path FROM blacklist WHERE id = ?', [id]);
        if (!oldBlacklist) {
            return res.status(404).json({ status: 'error', message: 'Blacklist item not found.' });
        }

        // กำหนดค่า license_plate_img_path
        let newImagePath = oldBlacklist.license_plate_img_path; // ใช้รูปภาพเดิมเป็นค่าเริ่มต้น
        if (req.file) {
            // ถ้ามีการอัปโหลดภาพใหม่
            newImagePath = req.file.filename;
            if (oldBlacklist.license_plate_img_path && oldBlacklist.license_plate_img_path !== newImagePath) {
                deleteImageFile(oldBlacklist.license_plate_img_path); // ลบภาพเก่า
            }
        } else if (license_plate_img_path) {
            // ถ้าไม่มีภาพใหม่ แต่ client ส่ง license_plate_img_path เดิมมา
            newImagePath = license_plate_img_path;
        }

        const queryStr = `
            UPDATE blacklist 
            SET license_plate = ?, province = ?, vehicle_type = ?, vehicle_color = ?, vehicle_brand = ?, reason = ?, 
                license_plate_img_path = ?, updated_at = NOW()
            WHERE id = ?
        `;
        await query(queryStr, [license_plate, province, vehicle_type, vehicle_color, vehicle_brand, reason, newImagePath, id]);

        const [updatedBlacklist] = await query('SELECT * FROM blacklist WHERE id = ?', [id]);
        const io = getIO();
        io.emit('blacklist_updated', [updatedBlacklist]);
        res.json({ status: 'ok', blacklist: updatedBlacklist });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.delete('/blacklist/:id', authenticateJWT, async (req, res) => {
    const { id } = req.params;
    try {
        const [blacklist] = await query('SELECT license_plate_img_path FROM blacklist WHERE id = ?', [id]);
        if (blacklist && blacklist.license_plate_img_path) {
            deleteImageFile(blacklist.license_plate_img_path);
        }
        await query('DELETE FROM blacklist WHERE id = ?', [id]);
        const io = getIO();
        io.emit('blacklist_updated', []);
        res.json({ status: 'ok', message: 'Blacklist entry deleted.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.post('/vehicle-pass', authenticateJWT, upload.single('license_plate_img'), async (req, res) => {
    const { vehicle_id, camera_id } = req.body;
    const license_plate_img_path = req.file ? req.file.filename : null;

    if (!vehicle_id || !camera_id) {
        return res.status(400).json({ status: 'error', message: 'Vehicle ID and Camera ID are required.' });
    }

    try {
        const io = getIO();

        const [vehicle] = await query('SELECT * FROM vehicle WHERE id = ?', [vehicle_id]);
        if (!vehicle) {
            return res.status(404).json({ status: 'error', message: 'Vehicle not found.' });
        }

        const [camera] = await query('SELECT * FROM camera WHERE id = ?', [camera_id]);
        if (!camera) {
            return res.status(404).json({ status: 'error', message: 'Camera not found.' });
        }

        const result = await query(
            'INSERT INTO vehicle_pass (vehicle_id, camera_id, pass_time) VALUES (?, ?, NOW())',
            [vehicle_id, camera_id]
        );

        const [newPassData] = await query(
            `SELECT vp.id, vp.vehicle_id, vp.camera_id, vp.pass_time, v.license_plate, v.province, v.vehicle_type, v.vehicle_color, v.vehicle_brand, c.camera_name, c.camera_location
             FROM vehicle_pass vp
             JOIN vehicle v ON vp.vehicle_id = v.id
             JOIN camera c ON vp.camera_id = c.id
             WHERE vp.id = ?`,
            [result.insertId]
        );

        const newPass = {
            id: newPassData.id,
            vehicle_id: newPassData.vehicle_id,
            camera_id: newPassData.camera_id,
            license_plate: newPassData.license_plate,
            province: newPassData.province,
            vehicle_type: newPassData.vehicle_type,
            vehicle_color: newPassData.vehicle_color,
            vehicle_brand: newPassData.vehicle_brand,
            camera_name: newPassData.camera_name,
            camera_location: newPassData.camera_location,
            pass_time: newPassData.pass_time,
            is_blacklisted: false,
            blacklist_reason: null,
        };

        // ตรวจสอบการจับคู่กับ Blacklist
        const [blacklistMatch] = await query(
            'SELECT * FROM blacklist WHERE license_plate = ?',
            [newPass.license_plate]
        );
        if (blacklistMatch) {
            newPass.is_blacklisted = true;
            newPass.blacklist_reason = blacklistMatch.reason;
            io.emit('alert_match', {
                cameraId: camera_id,
                vehicle: newPass,
                blacklistItem: blacklistMatch,
                message: 'ป้ายทะเบียนตรงกัน 100%'
            });
        } else {
            // ตรวจสอบลักษณะคล้าย (vehicle_type, vehicle_color, vehicle_brand)
            const [similarBlacklist] = await query(
                'SELECT * FROM blacklist WHERE vehicle_type = ? AND vehicle_color = ? AND vehicle_brand = ? LIMIT 1',
                [newPass.vehicle_type, newPass.vehicle_color, newPass.vehicle_brand]
            );
            if (similarBlacklist) {
                newPass.is_blacklisted = true;
                newPass.blacklist_reason = similarBlacklist.reason;
                io.emit('alert_match', {
                    cameraId: camera_id,
                    vehicle: newPass,
                    blacklistItem: similarBlacklist,
                    message: 'ลักษณะคล้ายกับ Blacklist'
                });
            }
        }
        io.to(`vehicle_${vehicle_id}`).emit("new_pass", newPass);
        io.emit('cctv_updated', newPass);
        res.status(201).json({ status: 'ok', message: 'Vehicle pass recorded successfully.', data: newPass });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.get('/vehicle-pass/history', authenticateJWT, async (req, res) => {
    try {
        const { vehicle_id, start_date, end_date, days_ago } = req.query; // เพิ่ม days_ago
        if (!vehicle_id) {
            return res.status(400).json({ status: 'error', message: 'vehicle_id is required' });
        }
        const vehicleId = parseInt(vehicle_id, 10);
        if (isNaN(vehicleId)) {
            return res.status(400).json({ status: 'error', message: 'Invalid vehicle_id: must be a number' });
        }

        let queryStr = `
            SELECT vp.id, vp.vehicle_id, vp.camera_id, vp.pass_time, 
                   v.license_plate, v.province, c.camera_name, c.camera_location
            FROM vehicle_pass vp
            JOIN vehicle v ON vp.vehicle_id = v.id
            JOIN camera c ON vp.camera_id = c.id
            WHERE vp.vehicle_id = ?
        `;
        const values = [vehicleId];

        if (days_ago) {
            const numDays = parseInt(days_ago, 10);
            if (isNaN(numDays) || numDays <= 0) {
                return res.status(400).json({ status: 'error', message: 'Invalid days_ago: must be a positive number.' });
            }
            
            const filterStartDate = new Date();
            filterStartDate.setDate(filterStartDate.getDate() - numDays);
            
            queryStr += ' AND vp.pass_time >= ?';
            values.push(filterStartDate);
            // ไม่จำเป็นต้องระบุ end_date ที่นี่ เพราะหมายถึง "จนถึงปัจจุบัน"
            // และ query จะไม่มีขอบเขตบน เว้นแต่ end_date จะถูกระบุด้วย (ซึ่งไม่ควรเป็นเช่นนั้นหากใช้ days_ago)

        } else if (start_date || end_date) { // ใช้ logic เดิมถ้าไม่ได้ระบุ days_ago
            if (start_date) {
                queryStr += ' AND vp.pass_time >= ?';
                values.push(start_date);
            }
            if (end_date) {
                queryStr += ' AND vp.pass_time <= ?';
                values.push(`${end_date} 23:59:59`);
            }
        }
        queryStr += ' ORDER BY vp.pass_time DESC';
        const rows = await query(queryStr, values);

        const results = await Promise.all(rows.map(async (row) => {
            const [blacklistMatch] = await query(
                'SELECT reason FROM blacklist WHERE license_plate = ?',
                [row.license_plate]
            );
            return {
                id: row.id,
                vehicle_id: row.vehicle_id,
                camera_id: row.camera_id,
                license_plate: row.license_plate,
                province: row.province,
                camera_name: row.camera_name,
                camera_location: row.camera_location,
                pass_time: row.pass_time,
                is_blacklisted: !!blacklistMatch,
                blacklist_reason: blacklistMatch ? blacklistMatch.reason : null,
            };
        }));

        res.json({ status: 'ok', data: results });
    } catch (err) {
        console.error("Error in /vehicle-pass/history:", err);
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});

app.get('/vehicle-pass/search', authenticateJWT, async (req, res) => {
  try {
    const { license_plate, province, camera_ids, start_time, end_time, date } = req.query;

    let queryStr;
    const values = [];

    // แยก camera_ids
    const cameraIdArray = camera_ids ? camera_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : [];

    if (cameraIdArray.length === 2) {
      // กรณีเลือกสองกล้อง (เช่น 10,12)
      // ขั้นตอนที่ 1: หา vehicle_id และช่วงเวลาของกล้องเริ่มต้นและสิ้นสุด
      const vehicleIdQuery = `
        SELECT vp1.vehicle_id, vp1.pass_time as start_pass_time, vp2.pass_time as end_pass_time
        FROM vehicle_pass vp1
        JOIN vehicle_pass vp2 ON vp1.vehicle_id = vp2.vehicle_id
        WHERE vp1.pass_time < vp2.pass_time
          AND vp1.camera_id = ? AND vp2.camera_id = ?
      `;
      const vehicleIds = await query(vehicleIdQuery, [cameraIdArray[0], cameraIdArray[1]]);

      if (vehicleIds.length === 0) {
        return res.json({ status: 'ok', message: 'ไม่พบรถที่ผ่านกล้องตามลำดับ', data: [] });
      }

      // ขั้นตอนที่ 2: ดึงข้อมูลการผ่านทั้งหมดของ vehicle_id ในช่วงเวลาระหว่าง start_pass_time และ end_pass_time
      const vehicleIdList = vehicleIds.map(row => row.vehicle_id);
      const passTimeConditions = vehicleIds.map((_, index) => 
        `(vp.vehicle_id = ? AND vp.pass_time BETWEEN ? AND ?)`
      ).join(' OR ');

      queryStr = `
        SELECT vp.id, vp.vehicle_id, vp.camera_id, vp.pass_time, 
               v.license_plate, v.province, c.camera_name
        FROM vehicle_pass vp
        JOIN vehicle v ON vp.vehicle_id = v.id
        JOIN camera c ON vp.camera_id = c.id
        WHERE (${passTimeConditions})
      `;
      vehicleIds.forEach(row => {
        values.push(row.vehicle_id, row.start_pass_time, row.end_pass_time);
      });
    } else if (cameraIdArray.length === 1) {
      // กรณีเลือกกล้องเดียว
      queryStr = `
        SELECT vp.id, vp.vehicle_id, vp.camera_id, vp.pass_time, 
               v.license_plate, v.province, c.camera_name
        FROM vehicle_pass vp
        JOIN vehicle v ON vp.vehicle_id = v.id
        JOIN camera c ON vp.camera_id = c.id
        WHERE vp.camera_id = ?
      `;
      values.push(cameraIdArray[0]);
    } else {
      // กรณีไม่เลือกกล้อง
      queryStr = `
        SELECT vp.id, vp.vehicle_id, vp.camera_id, vp.pass_time, 
               v.license_plate, v.province, c.camera_name
        FROM vehicle_pass vp
        JOIN vehicle v ON vp.vehicle_id = v.id
        JOIN camera c ON vp.camera_id = c.id
        WHERE 1=1
      `;
    }

    if (license_plate) {
      queryStr += ' AND v.license_plate LIKE ?';
      values.push(`%${license_plate}%`);
    }
    if (province) {
      queryStr += ' AND v.province = ?';
      values.push(province);
    }
    if (start_time) {
      queryStr += ' AND vp.pass_time >= ?';
      values.push(start_time);
    }
    if (end_time) {
      queryStr += ' AND vp.pass_time <= ?';
      values.push(end_time);
    }
    if (date) {
      queryStr += ' AND DATE(vp.pass_time) = ?';
      values.push(date);
    }

    queryStr += ' ORDER BY vp.pass_time DESC';
    const rows = await query(queryStr, values);

    const results = await Promise.all(rows.map(async (row) => {
      const [blacklistMatch] = await query(
        'SELECT reason FROM blacklist WHERE license_plate = ?',
        [row.license_plate]
      );
      return {
        id: row.id,
        vehicle_id: row.vehicle_id,
        camera_id: row.camera_id,
        license_plate: row.license_plate,
        province: row.province,
        camera_name: row.camera_name,
        pass_time: row.pass_time,
        is_blacklisted: !!blacklistMatch,
        blacklist_reason: blacklistMatch ? blacklistMatch.reason : null,
      };
    }));

    if (results.length === 0) {
      return res.json({ status: 'ok', message: 'ไม่พบผลลัพธ์', data: [] });
    }

    res.json({ status: 'ok', data: results });
  } catch (err) {
    console.error("ข้อผิดพลาดใน /vehicle-pass/search:", err);
    res.status(500).json({ status: 'error', message: 'ข้อผิดพลาดฐานข้อมูล: ' + err.message });
  }
});

app.get('/vehicle-pass/:cameraId', authenticateJWT, async (req, res) => {
    const { cameraId } = req.params;

    try {
        const rows = await query(
            `SELECT vp.id, vp.vehicle_id, vp.camera_id, vp.pass_time, v.license_plate, c.camera_name, c.camera_location
             FROM vehicle_pass vp
             JOIN vehicle v ON vp.vehicle_id = v.id
             JOIN camera c ON vp.camera_id = c.id
             WHERE vp.camera_id = ?
             ORDER BY vp.pass_time DESC`,
            [cameraId]
        );

        const results = await Promise.all(rows.map(async row => {
            const [blacklistMatch] = await query(
                'SELECT * FROM blacklist WHERE license_plate = ?',
                [row.license_plate]
            );
            return {
                id: row.id,
                vehicle_id: row.vehicle_id,
                camera_id: row.camera_id,
                license_plate: row.license_plate,
                camera_name: row.camera_name,
                camera_location: row.camera_location,
                pass_time: row.pass_time,
                is_blacklisted: !!blacklistMatch,
                blacklist_reason: blacklistMatch ? blacklistMatch.reason : null,
            };
        }));

        res.json({ status: 'ok', data: results });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database error: ' + err.message });
    }
});




// WebSocket setup function
function setupSocketIO(io) {
  io.on('connection', (socket) => {
    console.log('WebSocket Client connected:', socket.id);

    socket.on('subscribe_cctv', async (cameraId) => {
      try {
        const rows = await query(`
          SELECT vp.id, vp.vehicle_id, vp.camera_id, vp.pass_time, v.license_plate, c.camera_name, c.camera_location
          FROM vehicle_pass vp
          JOIN vehicle v ON vp.vehicle_id = v.id
          JOIN camera c ON vp.camera_id = c.id
          WHERE vp.camera_id = ?
          ORDER BY vp.pass_time DESC`,
          [cameraId]
        );
        socket.emit('cctv_updated', rows);
      } catch (err) {
        console.error('Error sending CCTV data (WebSocket):', err);
      }
    });

    socket.on('subscribe_blacklist', async () => {
      try {
        const blacklist = await query('SELECT * FROM blacklist');
        socket.emit('blacklist_updated', blacklist);
      } catch (err) {
        console.error('Error sending blacklist (WebSocket):', err);
      }
    });

    socket.on('join_vehicle_room', ({ vehicle_id }) => socket.join(`vehicle_${vehicle_id}`));
    socket.on('leave_vehicle_room', ({ vehicle_id }) => socket.leave(`vehicle_${vehicle_id}`));
    socket.on('disconnect', () => console.log('WebSocket Client disconnected:', socket.id));
  });
}

// Export ให้ server.js ใช้
module.exports = {
  app,
  setupSocketIO,
  setIO,
  getIO,
};