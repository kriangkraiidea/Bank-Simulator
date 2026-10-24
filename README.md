# 🏦 Bank Simulator (เศรษฐี Digital Bank)

ระบบธนาคารดิจิทัลสำหรับเกม **Monopoly / เศรษฐี** ทำงานบน **Cloudflare Pages + D1 Database + Pages Functions (Workers)** — โอนเงินข้ามมือถือได้แบบ Real-time ไม่ต้องใช้เงินกระดาษ

GitHub Repository: [kriangkraiidea/-Bank-Simulator](https://github.com/kriangkraiidea/-Bank-Simulator.git)

---

## ✨ Features

- 🎲 **ห้องเกม & Room Code**: สร้างเกมแล้วได้ Code 6 หลัก ส่งให้เพื่อนเข้าร่วมได้ทันที
- 📱 **เล่นข้ามอุปกรณ์**: แต่ละคนใช้มือถือตัวเองผ่าน Web Browser (ไม่ต้องลงแอป)
- 🏦 **ธนาคาร System**: ไม่ต้องมีผู้เล่นรับบทเป็นนายธนาคาร ผู้เล่นเบิก/จ่ายธนาคารเองได้
- 💸 **โอนเงิน P2P**: โอนเงินระหว่างผู้เล่น ระบุจำนวนและเหตุผลได้
- ⚡ **ปุ่มด่วน (Quick Reasons)**: ค่าเช่า, ผ่านจุดสตาร์ท (GO), ไพ่โชค, ภาษี, ซื้อที่ดิน, สร้างบ้าน, ประกันตัว
- 📋 **Transaction Log**: บันทึกประวัติการเงินทุกรายการแบบ Real-time พร้อมปุ่ม Export CSV
- ⚠️ **ระบบความปลอดภัย & กฎเกม**:
  - ยืนยัน 2 ขั้นตอน (Confirm Modal) ก่อนโอนเงิน
  - บังคับระบุเหตุผลเมื่อโอนจากธนาคาร (ป้องกันการโกง)
  - แจ้งเตือนเมื่อเงินใกล้หมด (< ฿2,000)
  - รองรับสถานะล้มละลาย (Bankrupt)

---

## 🏗️ Architecture

```
GitHub Push (main branch)
       │
       ▼
Cloudflare Pages (Auto-Deploy)
  ├── public/index.html            ← Frontend SPA (Tailwind CSS)
  └── functions/api/...            ← Serverless API (Cloudflare Workers)
            │
            ▼ SQL Queries
   Cloudflare D1 Database
(UUID: 2424a2cf-914a-4158-a79a-813ad70b84d2)
```

---

## 🚀 วิธีตั้งค่าและเชื่อมต่อ Cloudflare Pages กับ GitHub

### ขั้นตอนที่ 1: ติดตั้ง Database Schema ลง D1

ในโฟลเดอร์โปรเจกต์ `d:\Bank-Simulator`:
```bash
npm install
npm run db:init
```
*(คำสั่งนี้จะรัน `schema.sql` เพื่อสร้างตาราง `games`, `players`, `transactions` ใน D1 Database ของคุณ)*

---

### ขั้นตอนที่ 2: Push โค้ดขึ้น GitHub

```bash
git add .
git commit -m "feat: complete Monopoly Bank Simulator on Cloudflare Pages + D1"
git push -u origin main
```

---

### ขั้นตอนที่ 3: เชื่อมต่อ Cloudflare Pages ให้ Auto-Deploy ตาม GitHub

1. ล็อกอินเข้า [Cloudflare Dashboard](https://dash.cloudflare.com)
2. เมนูด้านซ้าย เลือก **Compute (Workers & Pages)** -> **Overview** -> กดปุ่ม **Create application**
3. เลือกแท็บ **Pages** -> กด **Connect to Git**
4. เลือก GitHub Account ของคุณ และเลือก Repository **`-Bank-Simulator`**
5. ในหน้า **Set up builds and deployments**:
   - **Project name**: `bank-simulator` (หรือชื่อที่ต้องการ)
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: *(เว้นว่างไว้)*
   - **Build output directory**: `public`
6. กด **Save and Deploy**

---

### ขั้นตอนที่ 4: ผูก D1 Database เข้ากับ Cloudflare Pages (สำคัญมาก!)

เพื่อให้ Backend API ของ Cloudflare Pages มองเห็น D1 Database:
1. ในหน้าโปรเจกต์ Pages ของคุณ เข้าไปที่แท็บ **Settings** -> **Functions**
2. เลื่อนลงมาที่หัวข้อ **D1 database bindings** -> กด **Add binding**
3. ตั้งค่าดังนี้:
   - **Variable name**: `DB`  *(ตัวพิมพ์ใหญ่ตามโค้ด)*
   - **D1 database**: เลือกฐานข้อมูล D1 ที่มี UUID `2424a2cf-914a-4158-a79a-813ad70b84d2`
4. กด **Save**
5. ไปที่แท็บ **Deployments** -> กดจุดสามจุดข้าง Deployment ล่าสุด -> กด **Retry deployment** (เพื่อให้ binding มีผล)

🎉 **เสร็จสิ้น!** ทุกครั้งที่คุณแก้โค้ดแล้ว `git push` ขึ้น GitHub ทาง Cloudflare Pages จะ Build และ Deploy ขึ้นเว็บให้อัตโนมัติทันที

---

## 📁 โครงสร้างโปรเจกต์

```
Bank-Simulator/
├── public/
│   └── index.html                       # Single Page Application
├── functions/
│   └── api/
│       ├── game.js                      # POST /api/game (สร้างเกมใหม่)
│       └── game/[code]/
│           ├── index.js                 # GET /api/game/:code (ดึงข้อมูลเกม)
│           ├── transfer.js              # POST /api/game/:code/transfer (โอนเงินระหว่างผู้เล่น)
│           ├── bank.js                  # POST /api/game/:code/bank (โอนเงินเข้า/ออกจากธนาคาร)
│           ├── log.js                   # GET /api/game/:code/log (ดึงประวัติธุรกรรม)
│           └── bankrupt.js              # POST /api/game/:code/bankrupt (จัดการสถานะล้มละลาย)
├── schema.sql                           # SQLite Database Schema สำหรับ D1
├── wrangler.toml                        # Cloudflare Configuration & D1 Binding
├── package.json                         # Scripts & Dependencies
└── README.md
```
