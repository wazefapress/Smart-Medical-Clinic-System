require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const { GoogleGenAI } = require('@google/genai'); // استدعاء مكتبة جوجل الرسمية

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

// تهيئة عميل Gemini باستخدام المفتاح المخفي
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const db = new sqlite3.Database('./clinic.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS medical_forms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gender TEXT,
        age INTEGER,
        symptoms TEXT,
        severity TEXT,
        ai_analysis TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// مسار استقبال الاستمارة وتحليلها عبر Gemini
app.post('/api/submit-form', async (req, res) => {
    const { gender, age, symptoms, severity } = req.body;
    
    try {
        // نص التوجيه (System Instruction) والرسالة للنموذج المجاني gemini-2.5-flash
        const prompt = `أنت مساعد طبي ذكي. قم بتحليل بيانات وأعراض المريض التالية وقدم تقييماً مبدئياً ونصيحة طبية مختصرة باللغة العربية. تجنب إعطاء تشخيص نهائي، بل وجه المريض.
        
بيانات المريض:
- الجنس: ${gender === 'male' ? 'ذكر' : 'أنثى'}
- العمر: ${age}
- شدة الأعراض: ${severity}
- الأعراض المسجلة: ${symptoms}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // نموذج سريع ومجاني وممتاز في فهم النصوص العربية
            contents: prompt,
        });

        const ai_analysis = response.text || "تم استلام البيانات ولكن تعذر توليد التحليل.";

        // حفظ البيانات في قاعدة البيانات SQLite
        db.run(`INSERT INTO medical_forms (gender, age, symptoms, severity, ai_analysis) VALUES (?, ?, ?, ?, ?)`,
            [gender, age, symptoms, severity, ai_analysis], function(err) {
                if (err) {
                    return res.status(500).json({ success: false, message: err.message });
                }
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
            return res.status(500).json({ success: false, message: err.message });
        }
        res.status(200).json({ success: true, data: rows });
    });
});

app.listen(port, () => {
    console.log(`الخادم يعمل بنجاح على الرابط: http://localhost:${port}`);
});
