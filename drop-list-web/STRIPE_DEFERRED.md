# Stripe — สถานะชั่วคราว / Deferred billing

## ขณะนี้

**ยังไม่ได้ตั้งค่า Stripe ให้ครบสำหรับ production** (หรือตั้งเฉพาะบนเครื่อง dev / sandbox แยกต่างหาก)

เป้าหมายช่วงนี้คือ **deploy บน Vercel แล้วเทสฟังก์ชันหลักของแอปก่อน** (เช่น NextAuth, Google Drive, Supabase, playlist, playback)

## พฤติกรรมของโค้ด

- ถ้า **ไม่มี** `STRIPE_SECRET_KEY` และ `STRIPE_PRICE_ID` บน environment ที่ deploy อยู่ ระบบจะถือว่า billing **ยังไม่เปิด**
- API `/api/stripe/checkout` และ `/api/stripe/portal` จะตอบ **503** พร้อม `code: BILLING_DISABLED`
- `/api/stripe/webhook` จะตอบ **503** ถ้า Stripe หรือ `STRIPE_WEBHOOK_SECRET` ยังไม่พร้อม (`code: WEBHOOK_DISABLED`)
- ส่วนอื่นของแอปยังใช้งานได้ตามปกติ

## ในอนาคต — ต้อง integrate Stripe

เมื่อพร้อมรับชำระเงินจริงหรือต้องการให้ sandbox บน Vercel ทำงานครบ:

1. ตั้งค่า env บน Vercel (หรือ `.env.local` สำหรับ dev):
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID`
   - `STRIPE_WEBHOOK_SECRET` (จาก Stripe Dashboard → Webhooks → signing secret)
2. สร้าง webhook endpoint ชี้ไปที่  
   `https://<โดเมนของคุณ>/api/stripe/webhook`
3. ทดสอบ flow: Checkout → webhook → อัปเดต `plan` ใน Supabase

ลบหรืออัปเดตไฟล์นี้ได้เมื่อ Stripe ถูกตั้งค่าครบและทีมยืนยันแล้ว
