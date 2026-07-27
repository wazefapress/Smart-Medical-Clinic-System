require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// تهيئة عميل Gemini باستخدام المفتاح المخفي
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// استخدام المسار المطلق لحفظ قاعدة البيانات بشكل ثابت
const dbPath = path.resolve(__dirname, 'clinic.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message);
    } else {
        console.log("✅ تم الاتصال بقاعدة البيانات بنجاح في المسار:", dbPath);
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS medical_forms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gender TEXT,
        age INTEGER,
        symptoms TEXT,
        severity TEXT,
        ai_analysis TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error("❌ خطأ في إنشـاء الجدول:", err.message);
        } else {
            console.log("✅ جدول السجلات الطبية جاهز للاستخدام.");
        }
    });
});

// مسار استقبال الاستمارة وتحليلها وحفظها
app.post('/api/submit-form', async (req, res) => {
    const { gender, age, symptoms, severity } = req.body;
    
    try {
        // استخدام نموذج مجاني محدث ومتوافق تماماً مع الـ API
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `أنت مساعد طبي ذكي. قم بتحليل بيانات وأعراض المريض التالية وقدم تقييماً مبدئياً ونصيحة طبية مختصرة باللغة العربية. تجنب إعطاء تشخيص نهائي، بل وجه المريض.
        
بيانات المريض:
- الجنس: ${gender === 'male' ? 'ذكر' : 'أنثى'}
- العمر: ${age}
- شدة الأعراض: ${severity}
- الأعراض المسجلة: ${symptoms}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const ai_analysis = response.text() || "تم استلام البيانات ولكن تعذر توليد التحليل.";

        // حفظ البيانات في قاعدة البيانات SQLite
        db.run(`INSERT INTO medical_forms (gender, age, symptoms, severity, ai_analysis) VALUES (?, ?, ?, ?, ?)`,
            [gender, age, symptoms, severity, ai_analysis], function(err) {
                if (err) {
                    console.error("❌ خطأ أثناء الحفظ في القاعدة:", err.message);
                    return res.status(500).json({ success: false, message: err.message });
                }
                console.log("✅ تم حفظ الاستمارة بنجاح برقم ID:", this.lastID);
                res.status(200).json({ success: true, ai_analysis: ai_analysis });
            });

    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ success: false, message: "حدث خطأ أثناء الاتصال بخدمة الذكاء الاصطناعي." });
    }
});

// مسار جلب السجلات للوحة التحكم (محمي بكلمة مرور)
app.get('/api/forms', (req, res) => {
    const password = req.headers['x-admin-password'];
    
    if (password !== 'admin123') {
        return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة.' });
    }

    db.all(`SELECT * FROM medical_forms ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            console.error("❌ خطأ أثناء الجلب:", err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
        console.log(`📊 عدد السجلات المسترجعة من القاعدة: ${rows.length}`);
        res.status(200).json({ success: true, data: rows });
    });
});

app.listen(port, () => {
    console.log(`الخادم يعمل بنجاح على البورت: ${port}`);
});